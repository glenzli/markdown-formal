import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
    DEFAULT_CONFIG,
    buildPreviewCache,
    mergeConfig,
    scanFormalDocuments,
    scanExcludePatterns,
    shouldExcludeScanPath,
    toPosix
} from './core/formal-core';
import { appendPreviewDebugLog } from './core/debug-log';

const formalPlugin = require('./markdown-it-formal');

let scanInProgress = false;
let scanAgain = false;
let scanTimer: any = undefined;
let workspaceWatchersInstalled = false;

function elapsedMs(startedAt: number): number {
    return Date.now() - startedAt;
}

function workspaceRootPath(): string {
    const folders = vscode.workspace.workspaceFolders;
    return folders && folders.length > 0 ? folders[0].uri.fsPath : '';
}

function formalDirPath(rootPath: string): string {
    return path.join(rootPath, '.markdown-formal');
}

function hasFormalWorkspace(rootPath: string): boolean {
    return Boolean(rootPath && fs.existsSync(formalDirPath(rootPath)));
}

async function ensureConfig(rootPath: string, createIfMissing = true): Promise<any | undefined> {
    const cacheDir = path.join(rootPath, '.markdown-formal');
    if (!fs.existsSync(cacheDir)) {
        if (!createIfMissing) return undefined;
        fs.mkdirSync(cacheDir, { recursive: true });
    }

    const configPath = path.join(cacheDir, 'config.json');
    if (!fs.existsSync(configPath)) {
        const config = mergeConfig(DEFAULT_CONFIG);
        if (createIfMissing) {
            await fs.promises.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
        }
        return config;
    }

    try {
        const rawConfig = JSON.parse(await fs.promises.readFile(configPath, 'utf-8'));
        const config = mergeConfig(rawConfig);
        if (createIfMissing && JSON.stringify(rawConfig) !== JSON.stringify(config)) {
            await fs.promises.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
        }
        return config;
    } catch (_err) {
        return mergeConfig(DEFAULT_CONFIG);
    }
}

async function readWorkspaceDocuments(mdFiles: any[]) {
    const documents = [];
    for (const fileUri of mdFiles) {
        documents.push({
            filePath: toPosix(vscode.workspace.asRelativePath(fileUri, false)),
            content: await fs.promises.readFile(fileUri.fsPath, 'utf-8')
        });
    }
    return documents;
}

function vscodeExcludePattern(config: any): string {
    const patterns = scanExcludePatterns(config);
    if (patterns.length === 0) return '';
    return `{${patterns.join(',')}}`;
}

async function readSymbols(rootPath: string): Promise<any | undefined> {
    try {
        return JSON.parse(await fs.promises.readFile(path.join(rootPath, '.markdown-formal', 'symbols.json'), 'utf-8'));
    } catch (err: any) {
        if (err?.code === 'ENOENT') return undefined;
        throw err;
    }
}

async function readDefinitions(rootPath: string): Promise<any | undefined> {
    try {
        return JSON.parse(await fs.promises.readFile(path.join(rootPath, '.markdown-formal', 'definitions.json'), 'utf-8'));
    } catch (err: any) {
        if (err?.code === 'ENOENT') return undefined;
        throw err;
    }
}

async function scanWorkspaceOnce({ createConfig = false } = {}) {
    const rootPath = workspaceRootPath();
    if (!rootPath) return;
    if (!createConfig && !hasFormalWorkspace(rootPath)) return;

    const startedAt = Date.now();
    const config = await ensureConfig(rootPath, createConfig);
    if (!config) return;
    appendPreviewDebugLog(rootPath, config, 'extension:scan:start', { rootPath });
    const findStartedAt = Date.now();
    const mdFilesRaw = await vscode.workspace.findFiles(
        '**/*.md',
        vscodeExcludePattern(config)
    );
    const mdFiles = mdFilesRaw.filter((fileUri: any) => (
        !shouldExcludeScanPath(toPosix(vscode.workspace.asRelativePath(fileUri, false)), config)
    ));
    appendPreviewDebugLog(rootPath, config, 'extension:scan:files', {
        rawFiles: mdFilesRaw.length,
        files: mdFiles.length,
        elapsedMs: elapsedMs(findStartedAt)
    });
    const readStartedAt = Date.now();
    const documents = await readWorkspaceDocuments(mdFiles);
    appendPreviewDebugLog(rootPath, config, 'extension:scan:read', {
        files: documents.length,
        chars: documents.reduce((sum, document) => sum + String(document.content || '').length, 0),
        elapsedMs: elapsedMs(readStartedAt)
    });
    const externalStartedAt = Date.now();
    const symbols = await readSymbols(rootPath);
    const definitions = await readDefinitions(rootPath);
    appendPreviewDebugLog(rootPath, config, 'extension:scan:external-indexes', {
        symbols: Array.isArray(symbols) ? symbols.length : 0,
        definitions: Array.isArray(definitions) ? definitions.length : 0,
        elapsedMs: elapsedMs(externalStartedAt)
    });
    const formalStartedAt = Date.now();
    const state = scanFormalDocuments(documents, config, symbols, definitions);
    appendPreviewDebugLog(rootPath, config, 'extension:scan:formal', {
        labels: Object.keys(state.labels).length,
        pages: state.pages.length,
        definitions: state.definitions.length,
        symbols: state.symbols.length,
        issues: state.issues.length,
        elapsedMs: elapsedMs(formalStartedAt)
    });

    const cacheDir = path.join(rootPath, '.markdown-formal');
    if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
    }

    const writeStartedAt = Date.now();
    await fs.promises.writeFile(path.join(cacheDir, 'preview-cache.json'), `${JSON.stringify(buildPreviewCache(state), null, 2)}\n`, 'utf-8');
    await removeStaleArtifact(cacheDir, 'definition-index.md');
    await removeStaleArtifact(cacheDir, 'labels.json');
    await removeStaleArtifact(cacheDir, 'pages.json');
    await removeStaleArtifact(cacheDir, 'preview-index.json');
    appendPreviewDebugLog(rootPath, config, 'extension:scan:write', {
        elapsedMs: elapsedMs(writeStartedAt)
    });

    const errors = state.issues.filter(issue => issue.severity === 'error');
    const warnings = state.issues.filter(issue => issue.severity !== 'error');
    if (errors.length > 0 || warnings.length > 0) {
        console.warn(`[markdown-formal] Scan completed with ${errors.length} errors and ${warnings.length} warnings.`);
    } else {
        console.log('[markdown-formal] Scanned workspace and updated preview-cache.json');
    }
    appendPreviewDebugLog(rootPath, config, 'extension:scan:end', {
        errors: errors.length,
        warnings: warnings.length,
        elapsedMs: elapsedMs(startedAt)
    });
}

async function removeStaleArtifact(cacheDir: string, fileName: string) {
    try {
        await fs.promises.rm(path.join(cacheDir, fileName));
    } catch (err: any) {
        if (err?.code !== 'ENOENT') throw err;
    }
}

async function scanWorkspace({ createConfig = false } = {}) {
    if (scanInProgress) {
        scanAgain = true;
        const rootPath = workspaceRootPath();
        if (rootPath) {
            const config = await ensureConfig(rootPath, createConfig);
            if (config) appendPreviewDebugLog(rootPath, config, 'extension:scan:queued');
        }
        return;
    }

    scanInProgress = true;
    try {
        do {
            scanAgain = false;
            await scanWorkspaceOnce({ createConfig });
        } while (scanAgain);
    } catch (err) {
        console.error('[markdown-formal] Failed to scan workspace', err);
        const rootPath = workspaceRootPath();
        if (rootPath) {
            const config = await ensureConfig(rootPath, createConfig);
            if (config) appendPreviewDebugLog(rootPath, config, 'extension:scan:error', {
                error: err instanceof Error ? err.message : String(err)
            });
        }
    } finally {
        scanInProgress = false;
    }
}

function scheduleScan(delay = 1000) {
    const rootPath = workspaceRootPath();
    if (!hasFormalWorkspace(rootPath)) return;

    if (scanTimer) {
        clearTimeout(scanTimer);
    }

    scanTimer = setTimeout(() => {
        scanTimer = undefined;
        scanWorkspace();
    }, delay);
}

function shouldTriggerScanForPath(fileName: string, languageId?: string): boolean {
    if (/[\\\/]\.markdown-formal[\\\/]config\.json$/i.test(fileName)) return true;
    if (/[\\\/]\.markdown-formal[\\\/]symbols\.json$/i.test(fileName)) return true;
    if (/[\\\/]\.markdown-formal[\\\/]definitions\.json$/i.test(fileName)) return true;
    if (/[\\\/]\.markdown-formal[\\\/]/i.test(fileName)) return false;
    return languageId === 'markdown' || /\.md$/i.test(fileName);
}

export function activate(context: vscode.ExtensionContext) {
    if (hasFormalWorkspace(workspaceRootPath())) {
        scheduleScan(1000);
        installWorkspaceWatchers(context);
    }

    const refreshCmd = vscode.commands.registerCommand('markdown-formal.refreshIndex', async () => {
        await scanWorkspace({ createConfig: true });
        if (!workspaceWatchersInstalled) installWorkspaceWatchers(context);
        vscode.window.showInformationMessage('Markdown Formal: References refreshed successfully.');
    });
    context.subscriptions.push(refreshCmd);

    return {
        extendMarkdownIt(md: any) {
            const rootPath = workspaceRootPath();
            return md.use(formalPlugin, { rootPath });
        }
    };
}

function installWorkspaceWatchers(context: vscode.ExtensionContext) {
    if (workspaceWatchersInstalled) return;
    workspaceWatchersInstalled = true;

    const watcher = vscode.workspace.onDidSaveTextDocument((doc: any) => {
        const fileName = doc.uri?.fsPath || '';
        if (shouldTriggerScanForPath(fileName, doc.languageId)) {
            scheduleScan();
        }
    });

    context.subscriptions.push(watcher);

    const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.md');
    const configWatcher = vscode.workspace.createFileSystemWatcher('**/.markdown-formal/config.json');
    const symbolsWatcher = vscode.workspace.createFileSystemWatcher('**/.markdown-formal/symbols.json');
    const definitionsWatcher = vscode.workspace.createFileSystemWatcher('**/.markdown-formal/definitions.json');
    context.subscriptions.push(
        fileWatcher,
        fileWatcher.onDidCreate((uri: any) => {
            if (shouldTriggerScanForPath(uri?.fsPath || '')) scheduleScan();
        }),
        fileWatcher.onDidDelete((uri: any) => {
            if (shouldTriggerScanForPath(uri?.fsPath || '')) scheduleScan();
        }),
        fileWatcher.onDidChange((uri: any) => {
            if (shouldTriggerScanForPath(uri?.fsPath || '')) scheduleScan(1500);
        }),
        configWatcher,
        configWatcher.onDidCreate(() => scheduleScan()),
        configWatcher.onDidDelete(() => scheduleScan()),
        configWatcher.onDidChange(() => scheduleScan()),
        symbolsWatcher,
        symbolsWatcher.onDidCreate(() => scheduleScan()),
        symbolsWatcher.onDidDelete(() => scheduleScan()),
        symbolsWatcher.onDidChange(() => scheduleScan()),
        definitionsWatcher,
        definitionsWatcher.onDidCreate(() => scheduleScan()),
        definitionsWatcher.onDidDelete(() => scheduleScan()),
        definitionsWatcher.onDidChange(() => scheduleScan())
    );

}

export function deactivate() {
    if (scanTimer) {
        clearTimeout(scanTimer);
        scanTimer = undefined;
    }
}
