import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
    buildRuntimeDefinitions,
    findSymbolsInMarkdown,
    formatDisplayNumber,
    formatPageHeading,
    formatPageReference,
    mergeConfig,
    scanFormalDocuments,
    shouldExcludeScanPath,
    toPosix,
    typeName,
    type LabelData,
    type PageData,
    type RuntimeDefinitionData
} from '@markdown-formal/core';
import { ReaderProjectRegistry } from './projects';

const nodeFs = require('node:fs');
const http = require('node:http');
const { URL } = require('node:url');

const STATIC_CACHE_CONTROL = 'no-cache';
const API_CACHE_CONTROL = 'no-store';
const REFRESH_DELAY_MS = 160;
const READER_CONTENT_SECURITY_POLICY = [
    "default-src 'self'",
    "connect-src 'self'",
    "img-src 'self' data: https:",
    "style-src 'self'",
    // KaTeX positions scripts and extensible glyphs with generated style attributes.
    "style-src-attr 'unsafe-inline'",
    "script-src 'self'",
    "base-uri 'none'",
    "frame-ancestors 'self'"
].join('; ');
const MIME_TYPES: Record<string, string> = {
    '.css': 'text/css; charset=utf-8',
    '.gif': 'image/gif',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
};

export interface FormalReaderServerOptions {
    rootPath?: string;
    port?: number;
    staticRoot?: string;
    recentProjectsPath?: string;
    chooseProjectDirectory?: () => Promise<string | undefined>;
}

export interface FormalReaderServer {
    rootPath?: string;
    port: number;
    url: string;
    close(): Promise<void>;
}

interface WorkspaceSnapshot {
    revision: number;
    refreshedAt: string;
    state: any;
    documents: Map<string, string>;
}

interface WorkspaceChange {
    snapshot: WorkspaceSnapshot;
    changedPaths: string[];
}

function pathExists(filePath: string): Promise<boolean> {
    return fs.access(filePath).then(() => true, () => false);
}

function pathInside(rootPath: string, candidatePath: string): boolean {
    const relative = path.relative(rootPath, candidatePath);
    return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function stripUndefinedFields<T extends Record<string, unknown>>(value: T): T {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function displayLabel(label: LabelData, config: any, pagesByPath: Map<string, PageData>): string {
    const page = pagesByPath.get(label.filePath);
    if (page && ['chapter', 'appendix', 'intro', 'summary'].includes(label.type)) {
        return formatPageReference(page, config);
    }
    const number = formatDisplayNumber(label);
    const name = typeName(config, label.type);
    return number ? name + ' ' + number : name;
}

function decoratePage(page: PageData, config: any): Record<string, unknown> {
    return {
        ...page,
        displayHeading: formatPageHeading(page, config),
        displayReference: formatPageReference(page, config)
    };
}

function labelSummary(label: LabelData, config: any, pagesByPath: Map<string, PageData>): Record<string, unknown> {
    const { content: _content, ...summary } = label;
    return { ...summary, display: displayLabel(label, config, pagesByPath) };
}

function labelsForContent(snapshot: WorkspaceSnapshot, content: string): Record<string, unknown> {
    const pagesByPath = new Map<string, PageData>((snapshot.state.pages || []).map((page: PageData) => [page.filePath, page]));
    const ids = new Set<string>();
    const marker = /(?:@|#)([A-Za-z0-9_-]+)\b/g;
    let match: RegExpExecArray | null;
    while ((match = marker.exec(content))) {
        if (snapshot.state.labels?.[match[1]]) ids.add(match[1]);
    }
    return Object.fromEntries(Array.from(ids, id => [id, labelSummary(snapshot.state.labels[id], snapshot.state.config, pagesByPath)]));
}

/** `LabelData.startLine` is zero-based, matching the formal scanner. */
function sectionRecallPreview(content: string, startLine: number): string {
    const lines = content.split(/\r?\n/);
    const start = Math.max(0, Math.min(lines.length - 1, startLine));
    const heading = lines[start]?.match(/^\s{0,3}(#{1,6})\s+/);
    if (!heading) return '';

    const level = heading[1].length;
    const preview: string[] = [lines[start]];
    let chars = preview[0].length;
    let inDisplayMath = false;
    for (let index = start + 1; index < lines.length; index++) {
        const line = lines[index];
        const nextHeading = line.match(/^\s{0,3}(#{1,6})\s+/);
        if (nextHeading && nextHeading[1].length <= level) break;
        preview.push(line);
        chars += line.length + 1;

        const trimmed = line.trim();
        if (trimmed === '$$' || trimmed === '\\[' || trimmed === '\\]') inDisplayMath = !inDisplayMath;
        if (chars >= 1200 && !inDisplayMath && !trimmed) break;
        if (chars >= 1800 && !inDisplayMath) break;
    }
    return preview.join('\n').trim();
}

function definitionSummary(definition: RuntimeDefinitionData, index: number): Record<string, unknown> {
    const { content: _content, ...summary } = definition;
    return { ...summary, index };
}

function mimeType(filePath: string): string {
    return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function parsePort(value: string | undefined): number {
    if (value === undefined || value === '') return 0;
    const port = Number(value);
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
        throw new Error(`Invalid reader port: ${value}`);
    }
    return port;
}

class ReaderWorkspace {
    private snapshot: WorkspaceSnapshot | undefined;
    private watcher: any;
    private refreshTimer: any;
    private refreshing = false;
    private refreshQueued = false;
    private readonly listeners = new Set<(change: WorkspaceChange) => void>();
    private readonly pendingChangedPaths = new Set<string>();

    constructor(readonly rootPath: string) {}

    async start(): Promise<void> {
        await this.refresh();
        this.watcher = nodeFs.watch(this.rootPath, { recursive: true }, (_event: string, fileName: any) => {
            const relativePath = typeof fileName === 'string' ? toPosix(fileName) : '';
            if (relativePath && !this.shouldRefresh(relativePath)) return;
            this.scheduleRefresh(relativePath);
        });
        this.watcher.on?.('error', (error: Error) => {
            console.warn(`[markdown-formal] Reader watcher error: ${error.message}`);
        });
    }

    async close(): Promise<void> {
        if (this.refreshTimer) clearTimeout(this.refreshTimer);
        this.refreshTimer = undefined;
        this.watcher?.close?.();
        this.listeners.clear();
    }

    onChange(listener: (change: WorkspaceChange) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    current(): WorkspaceSnapshot {
        if (!this.snapshot) throw new Error('Reader workspace is not ready.');
        return this.snapshot;
    }

    private scheduleRefresh(filePath = ''): void {
        if (filePath) this.pendingChangedPaths.add(filePath.replace(/^\/+/, ''));
        if (this.refreshTimer) clearTimeout(this.refreshTimer);
        this.refreshTimer = setTimeout(() => {
            this.refreshTimer = undefined;
            void this.refresh().catch(error => console.error(`[markdown-formal] Reader refresh failed: ${error.message || error}`));
        }, REFRESH_DELAY_MS);
    }

    private shouldRefresh(filePath: string): boolean {
        const normalized = toPosix(filePath).replace(/^\/+/, '');
        if (!normalized) return true;
        if (normalized === '.markdown-formal/config.json') return true;
        if (normalized === '.markdown-formal/definitions.json') return true;
        if (normalized === '.markdown-formal/symbols.json') return true;
        if (normalized.startsWith('.markdown-formal/')) return false;
        return !shouldExcludeScanPath(normalized, this.snapshot?.state.config || mergeConfig({}));
    }

    private async readConfig(): Promise<any> {
        const configPath = path.join(this.rootPath, '.markdown-formal', 'config.json');
        if (!(await pathExists(configPath))) {
            throw new Error('Reader requires .markdown-formal/config.json in the project root. Run `markdown-formal prepare` first.');
        }
        return mergeConfig(JSON.parse(await fs.readFile(configPath, 'utf8')));
    }

    private async collectMarkdownFiles(config: any, directory = this.rootPath, files: string[] = []): Promise<string[]> {
        const entries = await fs.readdir(directory, { withFileTypes: true });
        for (const entry of entries) {
            const absolutePath = path.join(directory, entry.name);
            const relativePath = toPosix(path.relative(this.rootPath, absolutePath));
            if (entry.isDirectory()) {
                if (!shouldExcludeScanPath(relativePath, config)) {
                    await this.collectMarkdownFiles(config, absolutePath, files);
                }
                continue;
            }
            if (entry.isFile() && entry.name.toLowerCase().endsWith('.md') && !shouldExcludeScanPath(relativePath, config)) {
                files.push(absolutePath);
            }
        }
        return files.sort((left, right) => toPosix(path.relative(this.rootPath, left)).localeCompare(toPosix(path.relative(this.rootPath, right))));
    }

    private async readIndex(name: 'definitions' | 'symbols'): Promise<unknown> {
        try {
            return JSON.parse(await fs.readFile(path.join(this.rootPath, '.markdown-formal', `${name}.json`), 'utf8'));
        } catch (error: any) {
            if (error?.code === 'ENOENT') return undefined;
            throw error;
        }
    }

    private async refresh(): Promise<void> {
        if (this.refreshing) {
            this.refreshQueued = true;
            return;
        }

        this.refreshing = true;
        try {
            do {
                this.refreshQueued = false;
                const changedPaths = Array.from(this.pendingChangedPaths).sort();
                this.pendingChangedPaths.clear();
                const config = await this.readConfig();
                const files = await this.collectMarkdownFiles(config);
                const documents = await Promise.all(files.map(async absolutePath => ({
                    filePath: toPosix(path.relative(this.rootPath, absolutePath)),
                    content: await fs.readFile(absolutePath, 'utf8')
                })));
                const [definitions, symbols] = await Promise.all([
                    this.readIndex('definitions'),
                    this.readIndex('symbols')
                ]);
                const state = scanFormalDocuments(documents, config, symbols, definitions);
                this.snapshot = {
                    revision: (this.snapshot?.revision || 0) + 1,
                    refreshedAt: new Date().toISOString(),
                    state,
                    documents: new Map(documents.map(document => [document.filePath, document.content]))
                };
                this.listeners.forEach(listener => listener({ snapshot: this.snapshot as WorkspaceSnapshot, changedPaths }));
            } while (this.refreshQueued);
        } finally {
            this.refreshing = false;
        }
    }
}

function sendJson(response: any, status: number, value: unknown): void {
    const body = JSON.stringify(value);
    response.writeHead(status, {
        'cache-control': API_CACHE_CONTROL,
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(body)
    });
    response.end(body);
}

function sendText(response: any, status: number, body: string): void {
    response.writeHead(status, {
        'cache-control': API_CACHE_CONTROL,
        'content-type': 'text/plain; charset=utf-8',
        'content-length': Buffer.byteLength(body)
    });
    response.end(body);
}

function stateProjection(snapshot: WorkspaceSnapshot, rootPath: string): Record<string, unknown> {
    const definitions = buildRuntimeDefinitions(snapshot.state.definitions || []);
    const pages = snapshot.state.pages || [];
    return {
        revision: snapshot.revision,
        refreshedAt: snapshot.refreshedAt,
        rootName: path.basename(rootPath),
        language: snapshot.state.config?.language || 'zh',
        pages: pages.map((page: PageData) => decoratePage(page, snapshot.state.config)),
        definitions: definitions.map(definitionSummary),
        issues: snapshot.state.issues || [],
        dependencySummary: snapshot.state.dependencyGraph?.summary || {}
    };
}

async function readerStateProjection(workspace: ReaderWorkspace | undefined, rootPath: string | undefined, projects: ReaderProjectRegistry): Promise<Record<string, unknown>> {
    if (workspace && rootPath) {
        return { available: true, ...stateProjection(workspace.current(), rootPath) };
    }
    const recentProjects = await projects.list();
    return {
        available: false,
        revision: 0,
        refreshedAt: '',
        rootName: '',
        language: 'zh',
        pages: [],
        definitions: [],
        issues: [],
        dependencySummary: {},
        recentProjects: recentProjects.map((project, index) => ({
            index,
            rootName: project.rootName,
            openedAt: project.openedAt
        }))
    };
}

async function readJsonRequest(request: any, maximumBytes = 4096): Promise<any> {
    return new Promise((resolve, reject) => {
        let body = '';
        let received = 0;
        request.on('data', (chunk: unknown) => {
            received += Buffer.byteLength(String(chunk));
            if (received > maximumBytes) {
                reject(new Error('Request body is too large.'));
                request.destroy();
                return;
            }
            body += String(chunk);
        });
        request.once('error', reject);
        request.once('end', () => {
            if (!body.trim()) {
                resolve({});
                return;
            }
            try {
                resolve(JSON.parse(body));
            } catch (_error) {
                reject(new Error('Request body must be JSON.'));
            }
        });
    });
}

function resolveWorkspacePath(rootPath: string, relativePath: string): string | undefined {
    const normalized = toPosix(relativePath || '').replace(/^\/+/, '');
    if (!normalized) return undefined;
    const absolutePath = path.resolve(rootPath, normalized);
    return pathInside(rootPath, absolutePath) ? absolutePath : undefined;
}

async function sendStaticFile(response: any, staticRoot: string, requestPath: string): Promise<void> {
    const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
    const absolutePath = resolveWorkspacePath(staticRoot, relativePath);
    if (!absolutePath || !(await pathExists(absolutePath))) {
        sendText(response, 404, 'Reader asset not found.');
        return;
    }
    const body = await fs.readFile(absolutePath);
    response.writeHead(200, {
        'cache-control': STATIC_CACHE_CONTROL,
        'content-type': mimeType(absolutePath),
        'content-length': body.length,
        'content-security-policy': READER_CONTENT_SECURITY_POLICY
    });
    response.end(body);
}

async function sendWorkspaceAsset(response: any, workspace: ReaderWorkspace, requestedPath: string): Promise<void> {
    const absolutePath = resolveWorkspacePath(workspace.rootPath, requestedPath);
    if (!absolutePath || !(await pathExists(absolutePath))) {
        sendText(response, 404, 'Workspace asset not found.');
        return;
    }
    const extension = path.extname(absolutePath).toLowerCase();
    if (!['.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp'].includes(extension)) {
        sendText(response, 403, 'Only local image assets are available to the reader.');
        return;
    }
    const body = await fs.readFile(absolutePath);
    response.writeHead(200, {
        'cache-control': STATIC_CACHE_CONTROL,
        'content-type': mimeType(absolutePath),
        'content-length': body.length
    });
    response.end(body);
}

export async function startReaderServer(options: FormalReaderServerOptions): Promise<FormalReaderServer> {
    const staticRoot = options.staticRoot || path.resolve(__dirname, '..', 'reader');
    if (!(await pathExists(staticRoot))) {
        throw new Error(`Reader UI bundle is missing at ${staticRoot}. Run npm run build:reader.`);
    }

    const projects = new ReaderProjectRegistry({
        stateFilePath: options.recentProjectsPath,
        chooseDirectory: options.chooseProjectDirectory
    });
    let rootPath: string | undefined;
    let workspace: ReaderWorkspace | undefined;
    let unsubscribe = () => {};
    const eventResponses = new Set<any>();

    const broadcast = (snapshot: WorkspaceSnapshot | undefined, changedPaths: string[], projectChanged = false): void => {
        const event = `event: workspace-update\ndata: ${JSON.stringify({
            revision: snapshot?.revision || 0,
            refreshedAt: snapshot?.refreshedAt || '',
            changedPaths,
            projectChanged
        })}\n\n`;
        eventResponses.forEach(response => response.write(event));
    };

    const activateProject = async (inputPath: string): Promise<void> => {
        const project = await projects.remember(inputPath);
        const nextWorkspace = new ReaderWorkspace(project.rootPath);
        await nextWorkspace.start();
        const previousWorkspace = workspace;
        const previousUnsubscribe = unsubscribe;
        workspace = nextWorkspace;
        rootPath = project.rootPath;
        unsubscribe = nextWorkspace.onChange(({ snapshot, changedPaths }) => broadcast(snapshot, changedPaths));
        previousUnsubscribe();
        await previousWorkspace?.close();
        broadcast(nextWorkspace.current(), [], true);
    };

    if (options.rootPath) await activateProject(options.rootPath);

    const server = http.createServer(async (request: any, response: any) => {
        try {
            const url = new URL(request.url || '/', 'http://127.0.0.1');

            if (request.method === 'POST' && url.pathname === '/api/projects/pick') {
                const selectedPath = await projects.choose();
                if (selectedPath) await activateProject(selectedPath);
                sendJson(response, 200, await readerStateProjection(workspace, rootPath, projects));
                return;
            }

            if (request.method === 'POST' && url.pathname === '/api/projects/recent') {
                const body = await readJsonRequest(request);
                const index = Number(body?.index);
                if (!Number.isInteger(index) || index < 0) {
                    sendText(response, 400, 'Recent project index must be a non-negative integer.');
                    return;
                }
                const recentProjects = await projects.list();
                const selectedProject = recentProjects[index];
                if (!selectedProject) {
                    sendText(response, 404, 'Recent project not found.');
                    return;
                }
                await activateProject(selectedProject.rootPath);
                sendJson(response, 200, await readerStateProjection(workspace, rootPath, projects));
                return;
            }

            if (request.method !== 'GET') {
                sendText(response, 405, 'Reader is read-only.');
                return;
            }

            if (url.pathname === '/api/state') {
                sendJson(response, 200, await readerStateProjection(workspace, rootPath, projects));
                return;
            }

            if (url.pathname === '/api/events') {
                const snapshot = workspace?.current();
                response.writeHead(200, {
                    'cache-control': 'no-cache',
                    connection: 'keep-alive',
                    'content-type': 'text/event-stream'
                });
                response.write(`event: workspace-update\ndata: ${JSON.stringify({
                    revision: snapshot?.revision || 0,
                    refreshedAt: snapshot?.refreshedAt || '',
                    changedPaths: [],
                    initial: true,
                    projectChanged: !!workspace
                })}\n\n`);
                eventResponses.add(response);
                request.on('close', () => eventResponses.delete(response));
                return;
            }

            if (!workspace || !rootPath) {
                if (url.pathname.startsWith('/api/')) {
                    sendText(response, 409, 'Choose a Markdown Formal project first.');
                    return;
                }
                await sendStaticFile(response, staticRoot, url.pathname);
                return;
            }
            const snapshot = workspace.current();

            if (url.pathname === '/api/page') {
                const filePath = toPosix(url.searchParams.get('path') || '').replace(/^\/+/, '');
                const content = snapshot.documents.get(filePath);
                if (content === undefined) {
                    sendText(response, 404, 'Markdown page not found in the bound project.');
                    return;
                }
                const rawPage = (snapshot.state.pages || []).find((item: any) => item.filePath === filePath);
                const symbols = findSymbolsInMarkdown(content, snapshot.state.symbols || []).map(match => ({ ...match.symbol, index: match.index }));
                sendJson(response, 200, stripUndefinedFields({
                    revision: snapshot.revision,
                    filePath,
                    page: rawPage ? decoratePage(rawPage, snapshot.state.config) : undefined,
                    content,
                    labels: labelsForContent(snapshot, [content, ...symbols.map(symbol => symbol.meaning)].join('\n')),
                    symbols
                }));
                return;
            }

            if (url.pathname === '/api/recall') {
                const id = url.searchParams.get('id') || '';
                const label = snapshot.state.labels?.[id];
                const document = label ? snapshot.documents.get(label.filePath) : undefined;
                const content = label?.content || (label?.type === 'section' && document && label.startLine
                    ? sectionRecallPreview(document, label.startLine)
                    : '');
                if (!label || !content) {
                    sendText(response, 404, 'Recall content not found.');
                    return;
                }
                const pagesByPath = new Map<string, PageData>((snapshot.state.pages || []).map((page: PageData) => [page.filePath, page]));
                sendJson(response, 200, {
                    id,
                    ...label,
                    content,
                    display: displayLabel(label, snapshot.state.config, pagesByPath),
                    labels: labelsForContent(snapshot, content)
                });
                return;
            }

            if (url.pathname === '/api/definition') {
                const definitions = buildRuntimeDefinitions(snapshot.state.definitions || []);
                const index = Number(url.searchParams.get('index'));
                const definition = definitions[index];
                if (!Number.isInteger(index) || !definition) {
                    sendText(response, 404, 'Definition not found.');
                    return;
                }
                sendJson(response, 200, { index, ...definition, labels: labelsForContent(snapshot, definition.content || '') });
                return;
            }

            if (url.pathname === '/api/graph') {
                sendJson(response, 200, snapshot.state.dependencyGraph || {});
                return;
            }

            if (url.pathname === '/api/asset') {
                await sendWorkspaceAsset(response, workspace, url.searchParams.get('path') || '');
                return;
            }

            await sendStaticFile(response, staticRoot, url.pathname);
        } catch (error: any) {
            sendText(response, 500, error instanceof Error ? error.message : String(error));
        }
    });

    const requestedPort = parsePort(options.port === undefined ? undefined : String(options.port));
    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(requestedPort, '127.0.0.1', () => {
            server.off?.('error', reject);
            resolve();
        });
    });
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : requestedPort;
    const url = `http://127.0.0.1:${port}`;

    return {
        get rootPath() {
            return rootPath;
        },
        port,
        url,
        async close() {
            unsubscribe();
            eventResponses.forEach(response => response.end());
            eventResponses.clear();
            await workspace?.close();
            await new Promise<void>((resolve, reject) => server.close((error: Error | undefined) => error ? reject(error) : resolve()));
        }
    };
}
