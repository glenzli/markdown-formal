import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
const formalPlugin = require('./markdown-it-formal');

const SECTION_TYPES = ['section'];
const INCREMENTAL_TYPES = ['prop', 'lemma', 'theorem', 'cor'];
const NON_INCREMENTAL_TYPES = ['def', 'remark', 'example'];

export interface LabelData {
    type: string;
    title: string;
    filePath: string;
    bookKey?: string;
    bookTitle?: string;
    bookOrder?: number;
    unitKind?: string;
    unitKey?: string;
    unitLabel?: string;
    unitOrder?: number;
    appendix?: string;
    chapter?: number;
    number?: number;
    volumeKey?: string;
    volumeTitle?: string;
    volumeOrder?: number;
    content?: string;
    contentPreview?: string;
    startLine?: number;
    endLine?: number;
}

export interface PageData {
    kind: string;
    filePath: string;
    title: string;
    order: number;
    bookKey?: string;
    bookTitle?: string;
    bookOrder?: number;
    volumeKey?: string;
    volumeTitle?: string;
    volumeOrder?: number;
    unitKind?: string;
    unitKey?: string;
    unitLabel?: string;
    unitOrder?: number;
    chapter?: number;
    appendix?: string;
}

interface VolumeInfo {
    key: string;
    title: string;
    order: number;
}

interface BookInfo {
    key: string;
    title: string;
    order: number;
}

interface NumberingUnit {
    kind: 'chapter' | 'appendix';
    key: string;
    label: string;
    order: number;
    chapter?: number;
    appendix?: string;
}

interface UnitFile {
    fileUri: any;
    book: BookInfo;
    volume?: VolumeInfo;
    unit: NumberingUnit;
}

interface PendingBlock {
    type: string;
    id: string;
    title: string;
    filePath: string;
    book: BookInfo;
    unit: NumberingUnit;
    volume?: VolumeInfo;
    startLine: number;
    contentLines: string[];
}

let scanInProgress = false;
let scanAgain = false;
let scanTimer: any = undefined;

const DEFAULT_CONFIG = {
    language: "zh",
    dictionary: {
        zh: { theorem: "定理", lemma: "引理", prop: "命题", cor: "推论", def: "定义", remark: "注", example: "例", section: "§" },
        en: { theorem: "Theorem", lemma: "Lemma", prop: "Proposition", cor: "Corollary", def: "Definition", remark: "Remark", example: "Example", section: "§" }
    },
    ui: {
        zh: {
            back: "返回",
            toc: "目录",
            emptyToc: "暂无目录数据",
            units: "章节",
            chapter: "第 {number} 章",
            appendix: "附录 {label}",
            intro: "导读",
            summary: "小结",
            introBadge: "导",
            summaryBadge: "结",
            unvolumed: "未分卷",
            volume: "第 {number} 卷",
            book: "第 {number} 本",
            workspace: "工作区"
        },
        en: {
            back: "Back",
            toc: "Contents",
            emptyToc: "No outline",
            units: "Sections",
            chapter: "Chapter {number}",
            appendix: "Appendix {label}",
            intro: "Intro",
            summary: "Summary",
            introBadge: "I",
            summaryBadge: "S",
            unvolumed: "Unvolumed",
            volume: "Volume {number}",
            book: "Book {number}",
            workspace: "Workspace"
        }
    }
};

function mergeConfig(config: any): any {
    const existing = config && typeof config === 'object' ? config : {};
    return {
        ...DEFAULT_CONFIG,
        ...existing,
        language: existing.language === 'en' ? 'en' : 'zh',
        dictionary: {
            zh: { ...DEFAULT_CONFIG.dictionary.zh, ...(existing.dictionary?.zh || {}) },
            en: { ...DEFAULT_CONFIG.dictionary.en, ...(existing.dictionary?.en || {}) }
        },
        ui: {
            zh: { ...DEFAULT_CONFIG.ui.zh, ...(existing.ui?.zh || {}) },
            en: { ...DEFAULT_CONFIG.ui.en, ...(existing.ui?.en || {}) }
        }
    };
}

function getContentPreview(content: string, maxLength = 240): string {
    const text = content
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[`*_>#~-]+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    
    return text.length > maxLength ? text.slice(0, maxLength).trimEnd() + '...' : text;
}

function getLanguage(config: any): 'zh' | 'en' {
    return config && config.language === 'en' ? 'en' : 'zh';
}

function formatTemplate(template: string, values: Record<string, string>): string {
    return template.replace(/\{(\w+)\}/g, (_match, key) => values[key] || '');
}

function getUiText(config: any, key: string, values: Record<string, string> = {}): string {
    const language = getLanguage(config);
    const text = config?.ui?.[language]?.[key] || DEFAULT_CONFIG.ui[language][key] || DEFAULT_CONFIG.ui.zh[key] || '';
    return formatTemplate(text, values);
}

async function ensureConfig(rootPath: string): Promise<any> {
    const cacheDir = path.join(rootPath, '.markdown-formal');
    if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
    }

    const configPath = path.join(cacheDir, 'config.json');
    if (!fs.existsSync(configPath)) {
        const config = mergeConfig(DEFAULT_CONFIG);
        await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
        return config;
    }

    try {
        const rawConfig = JSON.parse(await fs.promises.readFile(configPath, 'utf-8'));
        const config = mergeConfig(rawConfig);
        if (JSON.stringify(rawConfig) !== JSON.stringify(config)) {
            await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
        }
        return config;
    } catch (_err) {
        return mergeConfig(DEFAULT_CONFIG);
    }
}

function parseFormalBlockStart(line: string) {
    const blockMatch = line.match(/^:::(prop|lemma|theorem|cor|def|remark|example|section)\s+\{([^}]+)\}\s*$/);
    if (!blockMatch) return null;
    
    const type = blockMatch[1];
    const inner = blockMatch[2];
    const idMatch = inner.match(/#([^\s]+)/);
    const titleMatch = inner.match(/title="([^"]*)"/);
    
    if (!idMatch) return null;
    
    return {
        type,
        id: idMatch[1],
        title: titleMatch ? titleMatch[1] : ''
    };
}

function parseVolumeOrder(value: string): number {
    if (/^\d+$/.test(value)) return parseInt(value, 10);

    const roman = value.toUpperCase();
    if (!/^[IVXLCDM]+$/.test(roman)) return Number.MAX_SAFE_INTEGER;

    const values: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
    let total = 0;
    let previous = 0;
    for (let i = roman.length - 1; i >= 0; i--) {
        const current = values[roman[i]] || 0;
        total += current < previous ? -current : current;
        previous = Math.max(previous, current);
    }

    return total || Number.MAX_SAFE_INTEGER;
}

function inferVolumeInfo(filePath: string, config?: any): VolumeInfo | undefined {
    const segment = filePath
        .split(/[\\/]/)
        .find(part => /^(?:vol|volume)[-_\s]?(?:\d+|[ivxlcdm]+)(?:[-_\s].*)?$/i.test(part));
    if (!segment) return undefined;

    const match = segment.match(/^(?:vol|volume)[-_\s]?(\d+|[ivxlcdm]+)(?:[-_\s].*)?$/i);
    const order = match ? parseVolumeOrder(match[1]) : Number.MAX_SAFE_INTEGER;
    const title = order === Number.MAX_SAFE_INTEGER ? segment.replace(/[-_]+/g, ' ') : getUiText(config, 'volume', { number: String(order) });

    return {
        key: segment.toLowerCase(),
        title,
        order
    };
}

function inferBookInfo(filePath: string, config?: any): BookInfo {
    const segment = filePath
        .split(/[\\/]/)
        .find(part => /^book[-_\s]?(?:\d+|[a-z0-9]+)(?:[-_\s].*)?$/i.test(part));
    if (!segment) {
        return {
            key: '__workspace__',
            title: getUiText(config, 'workspace'),
            order: 0
        };
    }

    const match = segment.match(/^book[-_\s]?(\d+|[ivxlcdm]+)?(?:[-_\s].*)?$/i);
    const order = match && match[1] ? parseVolumeOrder(match[1]) : Number.MAX_SAFE_INTEGER;
    const title = order === Number.MAX_SAFE_INTEGER ? segment.replace(/[-_]+/g, ' ') : getUiText(config, 'book', { number: String(order) });

    return {
        key: segment.toLowerCase(),
        title,
        order
    };
}

function getAlphaOrder(value: string): number {
    return value
        .toUpperCase()
        .split('')
        .reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0);
}

function parseNumberingUnit(basename: string): NumberingUnit | undefined {
    const chapterMatch = basename.match(/^(\d+)-.*\.md$/i);
    if (chapterMatch) {
        const chapter = parseInt(chapterMatch[1], 10);
        return {
            kind: 'chapter',
            key: `chapter-${chapter}`,
            label: String(chapter),
            order: chapter,
            chapter
        };
    }

    const appendixMatch = basename.match(/^appendix[-_\s]?([a-z]+|\d+)(?:[-_\s].*)?\.md$/i);
    if (!appendixMatch) return undefined;

    const raw = appendixMatch[1];
    const label = /^\d+$/.test(raw) ? raw : raw.toUpperCase();
    const appendixOrder = /^\d+$/.test(raw) ? parseInt(raw, 10) : getAlphaOrder(raw);

    return {
        kind: 'appendix',
        key: `appendix-${label.toLowerCase()}`,
        label,
        order: 100000 + appendixOrder,
        appendix: label
    };
}

function parseSpecialPageKind(basename: string): string | undefined {
    if (/^intro\.md$/i.test(basename)) return 'intro';
    if (/^summary\.md$/i.test(basename)) return 'summary';
    return undefined;
}

function getMarkdownTitle(content: string, fallback: string): string {
    const match = content.match(/^#\s+(.+?)\s*$/m);
    return match ? match[1].trim() : fallback;
}

function fallbackPageTitle(filePath: string): string {
    return path.basename(filePath, '.md').replace(/^\d+-/, '').replace(/[-_]+/g, ' ');
}

function getPageOrder(kind: string, unit?: NumberingUnit): number {
    if (kind === 'intro') return -100000;
    if (kind === 'summary') return 200000;
    return unit ? unit.order : 0;
}

function makeLabelData(pending: PendingBlock, itemNumber?: number, sectionNumber?: number, endLine?: number): LabelData {
    const content = pending.contentLines.join('\n');
    const label: LabelData = {
        type: pending.type,
        title: pending.title,
        filePath: pending.filePath,
        bookKey: pending.book.key,
        bookTitle: pending.book.title,
        bookOrder: pending.book.order,
        unitKind: pending.unit.kind,
        unitKey: pending.unit.key,
        unitLabel: pending.unit.label,
        unitOrder: pending.unit.order,
        content,
        contentPreview: getContentPreview(content),
        startLine: pending.startLine,
        endLine
    };

    if (pending.unit.chapter !== undefined) {
        label.chapter = pending.unit.chapter;
    }
    if (pending.unit.appendix !== undefined) {
        label.appendix = pending.unit.appendix;
    }

    if (INCREMENTAL_TYPES.includes(pending.type)) {
        label.number = itemNumber;
    } else if (SECTION_TYPES.includes(pending.type)) {
        label.number = sectionNumber;
    }

    if (pending.volume) {
        label.volumeKey = pending.volume.key;
        label.volumeTitle = pending.volume.title;
        label.volumeOrder = pending.volume.order;
    }

    return label;
}

async function scanWorkspaceOnce() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return;
    
    const rootPath = folders[0].uri.fsPath;
    const config = await ensureConfig(rootPath);
    // Find all markdown files (excluding node_modules)
    const mdFiles = await vscode.workspace.findFiles('**/*.md', '**/node_modules/**');
    
    const labels: Record<string, LabelData> = {};
    const unitFiles: Record<string, UnitFile[]> = {};
    const pages: PageData[] = [];
    
    // Group formal numbered files by book and unit. Chapters use 01-*.md; appendices use appendix-a*.md.
    for (const fileUri of mdFiles) {
        const basename = path.basename(fileUri.fsPath);
        const filePath = vscode.workspace.asRelativePath(fileUri, false);
        const book = inferBookInfo(filePath, config);
        const volume = inferVolumeInfo(filePath, config);
        const unit = parseNumberingUnit(basename);
        const specialKind = parseSpecialPageKind(basename);

        if (unit || specialKind) {
            const content = await fs.promises.readFile(fileUri.fsPath, 'utf-8');
            const kind = unit ? unit.kind : specialKind as string;
            const page: PageData = {
                kind,
                filePath,
                title: getMarkdownTitle(content, fallbackPageTitle(filePath)),
                order: getPageOrder(kind, unit),
                bookKey: book.key,
                bookTitle: book.title,
                bookOrder: book.order
            };

            if (volume) {
                page.volumeKey = volume.key;
                page.volumeTitle = volume.title;
                page.volumeOrder = volume.order;
            }

            if (unit) {
                page.unitKind = unit.kind;
                page.unitKey = unit.key;
                page.unitLabel = unit.label;
                page.unitOrder = unit.order;
                if (unit.chapter !== undefined) page.chapter = unit.chapter;
                if (unit.appendix !== undefined) page.appendix = unit.appendix;
            }

            pages.push(page);
        }

        if (!unit) continue;

        const volumeKey = volume?.key || '__root__';
        const scopeKey = unit.kind === 'appendix' ? `${book.key}:${volumeKey}:${unit.key}` : `${book.key}:${unit.key}`;
        if (!unitFiles[scopeKey]) unitFiles[scopeKey] = [];
        unitFiles[scopeKey].push({ fileUri, book, volume, unit });
    }
    
    for (const groupKey of Object.keys(unitFiles)) {
        // Sort files to ensure deterministic numbering if multiple files share a unit.
        const files = unitFiles[groupKey].sort((a, b) => a.fileUri.fsPath.localeCompare(b.fileUri.fsPath));
        let itemCounter: number = 1;
        let sectionCounter: number = 1;
        
        for (const unitFile of files) {
            const fileUri = unitFile.fileUri;
            const content = await fs.promises.readFile(fileUri.fsPath, 'utf-8');
            const lines = content.split(/\r?\n/);
            const filePath = vscode.workspace.asRelativePath(fileUri, false);
            const { book, volume, unit } = unitFile;
            
            let pendingBlock: PendingBlock | null = null;
            
            for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
                const line = lines[lineIndex];
                
                if (pendingBlock) {
                    if (line.match(/^:::\s*$/)) {
                        let itemNumber: number | undefined;
                        let sectionNumber: number | undefined;
                        
                        if (INCREMENTAL_TYPES.includes(pendingBlock.type)) {
                            itemNumber = itemCounter++;
                        } else if (SECTION_TYPES.includes(pendingBlock.type)) {
                            sectionNumber = sectionCounter++;
                        }
                        
                        if (labels[pendingBlock.id]) {
                            console.warn(`[markdown-formal] Duplicate label id "${pendingBlock.id}" in ${filePath}:${lineIndex + 1}; overwriting previous entry.`);
                        }
                        
                        labels[pendingBlock.id] = makeLabelData(pendingBlock, itemNumber, sectionNumber, lineIndex + 1);
                        pendingBlock = null;
                    } else {
                        pendingBlock.contentLines.push(line);
                    }
                    continue;
                }
                
                const blockStart = parseFormalBlockStart(line);
                if (blockStart) {
                    pendingBlock = {
                        ...blockStart,
                        filePath,
                        book,
                        unit,
                        volume,
                        startLine: lineIndex + 1,
                        contentLines: []
                    };
                }
            }
            
            if (pendingBlock) {
                console.warn(`[markdown-formal] Unclosed formal block "${pendingBlock.id}" in ${filePath}:${pendingBlock.startLine}; skipping label.`);
            }
        }
    }
    
    // Save state to .markdown-formal/labels.json
    const cacheDir = path.join(rootPath, '.markdown-formal');
    if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
    }
    const cachePath = path.join(cacheDir, 'labels.json');
    await fs.promises.writeFile(cachePath, JSON.stringify(labels, null, 2), 'utf-8');
    await fs.promises.writeFile(path.join(cacheDir, 'pages.json'), JSON.stringify(pages, null, 2), 'utf-8');
    console.log('[markdown-formal] Scanned workspace and updated labels.json');
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

export function activate(context: vscode.ExtensionContext) {
    // Perform initial scan
    scanWorkspace();
    
    // Re-scan when any markdown document is saved
    const watcher = vscode.workspace.onDidSaveTextDocument((doc: any) => {
        const fileName = doc.uri?.fsPath || '';
        if (doc.languageId === 'markdown' || /[\\\/]\.markdown-formal[\\\/]config\.json$/i.test(fileName)) {
            scheduleScan();
        }
    });
    
    context.subscriptions.push(watcher);
    
    const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.md');
    const configWatcher = vscode.workspace.createFileSystemWatcher('**/.markdown-formal/config.json');
    context.subscriptions.push(
        fileWatcher,
        fileWatcher.onDidCreate(() => scheduleScan()),
        fileWatcher.onDidDelete(() => scheduleScan()),
        fileWatcher.onDidChange(() => scheduleScan()),
        configWatcher,
        configWatcher.onDidCreate(() => scheduleScan()),
        configWatcher.onDidDelete(() => scheduleScan()),
        configWatcher.onDidChange(() => scheduleScan())
    );
    
    // Register force refresh command
    const refreshCmd = vscode.commands.registerCommand('markdown-formal.refreshLabels', async () => {
        await scanWorkspace();
        vscode.window.showInformationMessage('Markdown Formal: References refreshed successfully.');
    });
    context.subscriptions.push(refreshCmd);
    
    // Return object to inject markdown-it plugin
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
