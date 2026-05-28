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

const formalPlugin = require('./markdown-it-formal');

let scanInProgress = false;
let scanAgain = false;
let scanTimer: any = undefined;

async function ensureConfig(rootPath: string): Promise<any> {
    const cacheDir = path.join(rootPath, '.markdown-formal');
    if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
    }

    const configPath = path.join(cacheDir, 'config.json');
    if (!fs.existsSync(configPath)) {
        const config = mergeConfig(DEFAULT_CONFIG);
        await fs.promises.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
        return config;
    }

    try {
        const rawConfig = JSON.parse(await fs.promises.readFile(configPath, 'utf-8'));
        const config = mergeConfig(rawConfig);
        if (JSON.stringify(rawConfig) !== JSON.stringify(config)) {
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

async function scanWorkspaceOnce() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return;

    const rootPath = folders[0].uri.fsPath;
    const config = await ensureConfig(rootPath);
    const mdFilesRaw = await vscode.workspace.findFiles(
        '**/*.md',
        vscodeExcludePattern(config)
    );
    const mdFiles = mdFilesRaw.filter((fileUri: any) => (
        !shouldExcludeScanPath(toPosix(vscode.workspace.asRelativePath(fileUri, false)), config)
    ));
    const documents = await readWorkspaceDocuments(mdFiles);
    const symbols = await readSymbols(rootPath);
    const definitions = await readDefinitions(rootPath);
    const state = scanFormalDocuments(documents, config, symbols, definitions);

    const cacheDir = path.join(rootPath, '.markdown-formal');
    if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
    }

    await fs.promises.writeFile(path.join(cacheDir, 'preview-cache.json'), `${JSON.stringify(buildPreviewCache(state), null, 2)}\n`, 'utf-8');
    await removeStaleArtifact(cacheDir, 'definition-index.md');
    await removeStaleArtifact(cacheDir, 'labels.json');
    await removeStaleArtifact(cacheDir, 'pages.json');
    await removeStaleArtifact(cacheDir, 'preview-index.json');

    const errors = state.issues.filter(issue => issue.severity === 'error');
    const warnings = state.issues.filter(issue => issue.severity !== 'error');
    if (errors.length > 0 || warnings.length > 0) {
        console.warn(`[markdown-formal] Scan completed with ${errors.length} errors and ${warnings.length} warnings.`);
    } else {
        console.log('[markdown-formal] Scanned workspace and updated preview-cache.json');
    }
}

async function removeStaleArtifact(cacheDir: string, fileName: string) {
    try {
        await fs.promises.rm(path.join(cacheDir, fileName));
    } catch (err: any) {
        if (err?.code !== 'ENOENT') throw err;
    }
}

async function scanWorkspace() {
    if (scanInProgress) {
        scanAgain = true;
        return;
    }

    scanInProgress = true;
    try {
        do {
            scanAgain = false;
            await scanWorkspaceOnce();
        } while (scanAgain);
    } catch (err) {
        console.error('[markdown-formal] Failed to scan workspace', err);
    } finally {
        scanInProgress = false;
    }
}

function scheduleScan(delay = 150) {
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
    scanWorkspace();

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
            if (shouldTriggerScanForPath(uri?.fsPath || '')) scheduleScan();
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

    const refreshCmd = vscode.commands.registerCommand('markdown-formal.refreshIndex', async () => {
        await scanWorkspace();
        vscode.window.showInformationMessage('Markdown Formal: References refreshed successfully.');
    });
    context.subscriptions.push(refreshCmd);

    return {
        extendMarkdownIt(md: any) {
            const folders = vscode.workspace.workspaceFolders;
            const rootPath = folders && folders.length > 0 ? folders[0].uri.fsPath : '';
            return md.use(formalPlugin, { rootPath });
        }
    };
}

export function deactivate() {
    if (scanTimer) {
        clearTimeout(scanTimer);
        scanTimer = undefined;
    }
}
