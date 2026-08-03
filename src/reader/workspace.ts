import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { mergeConfig, scanFormalDocuments, shouldExcludeScanPath, toPosix } from '@math-workspace/core';
import { isLeanSourcePath, scanLeanWorkspace } from '../lean/lean-index';

const nodeFs = require('node:fs');
const REFRESH_DELAY_MS = 160;

export interface WorkspaceSnapshot {
    revision: number;
    refreshedAt: string;
    state: any;
    documents: Map<string, string>;
}

export interface WorkspaceChange {
    snapshot: WorkspaceSnapshot;
    changedPaths: string[];
}

function pathExists(filePath: string): Promise<boolean> {
    return fs.access(filePath).then(() => true, () => false);
}

async function readConfig(rootPath: string): Promise<any> {
    const configPath = path.join(rootPath, '.math-workspace', 'config.json');
    if (!(await pathExists(configPath))) {
        throw new Error('Math Workspace requires .math-workspace/config.json in the project root. Run `math-workspace prepare` first.');
    }
    return mergeConfig(JSON.parse(await fs.readFile(configPath, 'utf8')));
}

async function collectMarkdownFiles(rootPath: string, config: any, directory = rootPath, files: string[] = []): Promise<string[]> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
        const absolutePath = path.join(directory, entry.name);
        const relativePath = toPosix(path.relative(rootPath, absolutePath));
        if (entry.isDirectory()) {
            if (!shouldExcludeScanPath(relativePath, config)) {
                await collectMarkdownFiles(rootPath, config, absolutePath, files);
            }
            continue;
        }
        if (entry.isFile() && entry.name.toLowerCase().endsWith('.md') && !shouldExcludeScanPath(relativePath, config)) {
            files.push(absolutePath);
        }
    }
    return files.sort((left, right) => toPosix(path.relative(rootPath, left)).localeCompare(toPosix(path.relative(rootPath, right))));
}

async function readIndex(rootPath: string, name: 'definitions' | 'symbols'): Promise<unknown> {
    try {
        return JSON.parse(await fs.readFile(path.join(rootPath, '.math-workspace', `${name}.json`), 'utf8'));
    } catch (error: any) {
        if (error?.code === 'ENOENT') return undefined;
        throw error;
    }
}

/** Produce the Reader/MCP scan without generating or modifying project artifacts. */
export async function loadWorkspaceSnapshot(rootPath: string, revision = 1): Promise<WorkspaceSnapshot> {
    const resolvedRoot = path.resolve(rootPath);
    const config = await readConfig(resolvedRoot);
    const files = await collectMarkdownFiles(resolvedRoot, config);
    const documents = await Promise.all(files.map(async absolutePath => ({
        filePath: toPosix(path.relative(resolvedRoot, absolutePath)),
        content: await fs.readFile(absolutePath, 'utf8')
    })));
    const [definitions, symbols] = await Promise.all([
        readIndex(resolvedRoot, 'definitions'),
        readIndex(resolvedRoot, 'symbols')
    ]);
    const formalState = scanFormalDocuments(documents, config, symbols, definitions);
    const leanIndex = await scanLeanWorkspace(resolvedRoot, config, formalState.labels, formalState.dependencyGraph);
    formalState.issues.push(...leanIndex.diagnostics.map(diagnostic => ({
        severity: diagnostic.severity,
        code: diagnostic.code,
        file: diagnostic.file,
        line: diagnostic.line,
        message: diagnostic.message
    })));
    return {
        revision,
        refreshedAt: new Date().toISOString(),
        state: { ...formalState, leanIndex },
        documents: new Map(documents.map(document => [document.filePath, document.content]))
    };
}

export class ReaderWorkspace {
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
            console.warn(`[math-workspace] Math Workspace watcher error: ${error.message}`);
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
        if (!this.snapshot) throw new Error('Math Workspace is not ready.');
        return this.snapshot;
    }

    private scheduleRefresh(filePath = ''): void {
        if (filePath) this.pendingChangedPaths.add(filePath.replace(/^\/+/, ''));
        if (this.refreshTimer) clearTimeout(this.refreshTimer);
        this.refreshTimer = setTimeout(() => {
            this.refreshTimer = undefined;
            void this.refresh().catch(error => console.error(`[math-workspace] Math Workspace refresh failed: ${error.message || error}`));
        }, REFRESH_DELAY_MS);
    }

    private shouldRefresh(filePath: string): boolean {
        const normalized = toPosix(filePath).replace(/^\/+/, '');
        if (!normalized) return true;
        if (normalized === '.math-workspace/config.json') return true;
        if (normalized === '.math-workspace/definitions.json') return true;
        if (normalized === '.math-workspace/symbols.json') return true;
        if (normalized === '.math-workspace/lean-build.json') return true;
        if (normalized === '.math-workspace/lean-contracts.json') return true;
        if (normalized === '.math-workspace/lean-dependency-graph.json') return true;
        if (normalized.startsWith('.math-workspace/')) return false;
        if (isLeanSourcePath(this.snapshot?.state.config || mergeConfig({}), normalized)) return true;
        return !shouldExcludeScanPath(normalized, this.snapshot?.state.config || mergeConfig({}));
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
                this.snapshot = await loadWorkspaceSnapshot(this.rootPath, (this.snapshot?.revision || 0) + 1);
                this.listeners.forEach(listener => listener({ snapshot: this.snapshot as WorkspaceSnapshot, changedPaths }));
            } while (this.refreshQueued);
        } finally {
            this.refreshing = false;
        }
    }
}
