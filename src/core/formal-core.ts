import * as path from 'node:path';

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

export interface FormalIssue {
    severity: 'error' | 'warn';
    code: string;
    file?: string;
    line?: number;
    message: string;
}

export interface FormalDefinition {
    id: string;
    type: string;
    title: string;
    file: string;
    line: number;
    label: LabelData;
}

export interface FormalReference {
    id: string;
    file: string;
    line: number;
}

export interface FormalDocument {
    filePath: string;
    content: string;
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
    filePath: string;
    content: string;
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

export const FORMAL_TYPES = ['prop', 'lemma', 'theorem', 'cor', 'def', 'remark', 'example', 'section'];
export const INCREMENTAL_TYPES = new Set(['prop', 'lemma', 'theorem', 'cor']);
export const SECTION_TYPES = new Set(['section']);
export const HASH_ID_RE = /^h-[a-f0-9]{16,32}$/;
export const TMP_ID_RE = /^tmp-[A-Za-z0-9_-]+$/;

export const DEFAULT_CONFIG = {
    language: 'zh',
    dictionary: {
        zh: { theorem: '定理', lemma: '引理', prop: '命题', cor: '推论', def: '定义', remark: '注', example: '例', section: '§' },
        en: { theorem: 'Theorem', lemma: 'Lemma', prop: 'Proposition', cor: 'Corollary', def: 'Definition', remark: 'Remark', example: 'Example', section: '§' }
    },
    ui: {
        zh: {
            back: '返回',
            toc: '目录',
            emptyToc: '暂无目录数据',
            units: '章节',
            chapter: '第 {number} 章',
            appendix: '附录 {label}',
            intro: '导读',
            summary: '小结',
            introBadge: '导',
            summaryBadge: '结',
            unvolumed: '未分卷',
            volume: '第 {number} 卷',
            book: '第 {number} 本',
            workspace: '工作区'
        },
        en: {
            back: 'Back',
            toc: 'Contents',
            emptyToc: 'No outline',
            units: 'Sections',
            chapter: 'Chapter {number}',
            appendix: 'Appendix {label}',
            intro: 'Intro',
            summary: 'Summary',
            introBadge: 'I',
            summaryBadge: 'S',
            unvolumed: 'Unvolumed',
            volume: 'Volume {number}',
            book: 'Book {number}',
            workspace: 'Workspace'
        }
    }
};

export function toPosix(filePath: string): string {
    return filePath.split(path.sep).join('/');
}

export function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function unique(values: string[]): string[] {
    return [...new Set(values.filter(Boolean))];
}

export function mergeConfig(config: any): any {
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

export function getLanguage(config: any): 'zh' | 'en' {
    return config && config.language === 'en' ? 'en' : 'zh';
}

export function formatTemplate(template: string, values: Record<string, string> = {}): string {
    return template.replace(/\{(\w+)\}/g, (_match, key) => values[key] || '');
}

export function uiText(config: any, key: string, values: Record<string, string> = {}): string {
    const language = getLanguage(config);
    const text = config?.ui?.[language]?.[key] || DEFAULT_CONFIG.ui[language]?.[key] || DEFAULT_CONFIG.ui.zh[key] || '';
    return formatTemplate(text, values);
}

export function typeName(config: any, type: string): string {
    const language = getLanguage(config);
    return config?.dictionary?.[language]?.[type] || DEFAULT_CONFIG.dictionary[language]?.[type] || type;
}

export function getContentPreview(content: string, maxLength = 240): string {
    const text = content
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[`*_>#~-]+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}...` : text;
}

export function stripIgnoredMarkdown(content: string): string {
    return content
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/```[\s\S]*?```/g, '')
        .replace(/~~~[\s\S]*?~~~/g, '')
        .replace(/`[^`\n]*`/g, '');
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

function inferBookInfo(filePath: string, config: any): BookInfo {
    const segment = filePath
        .split('/')
        .find(part => /^book[-_\s]?(?:\d+|[a-z0-9]+)(?:[-_\s].*)?$/i.test(part));
    if (!segment) {
        return { key: '__workspace__', title: uiText(config, 'workspace'), order: 0 };
    }

    const match = segment.match(/^book[-_\s]?(\d+|[ivxlcdm]+)?(?:[-_\s].*)?$/i);
    const order = match && match[1] ? parseVolumeOrder(match[1]) : Number.MAX_SAFE_INTEGER;
    const title = order === Number.MAX_SAFE_INTEGER ? segment.replace(/[-_]+/g, ' ') : uiText(config, 'book', { number: String(order) });
    return { key: segment.toLowerCase(), title, order };
}

function inferVolumeInfo(filePath: string, config: any): VolumeInfo | undefined {
    const segment = filePath
        .split('/')
        .find(part => /^(?:vol|volume)[-_\s]?(?:\d+|[ivxlcdm]+)(?:[-_\s].*)?$/i.test(part));
    if (!segment) return undefined;

    const match = segment.match(/^(?:vol|volume)[-_\s]?(\d+|[ivxlcdm]+)(?:[-_\s].*)?$/i);
    const order = match ? parseVolumeOrder(match[1]) : Number.MAX_SAFE_INTEGER;
    const title = order === Number.MAX_SAFE_INTEGER ? segment.replace(/[-_]+/g, ' ') : uiText(config, 'volume', { number: String(order) });
    return { key: segment.toLowerCase(), title, order };
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
    return path.posix.basename(filePath, '.md')
        .replace(/^\d+-/, '')
        .replace(/^appendix[-_\s]?[a-z0-9]+[-_\s]?/i, '')
        .replace(/[-_]+/g, ' ');
}

function getPageOrder(kind: string, unit?: NumberingUnit): number {
    if (kind === 'intro') return -100000;
    if (kind === 'summary') return 200000;
    return unit ? unit.order : 0;
}

export function parseFormalBlockStart(line: string): any {
    const match = line.match(/^:::(prop|lemma|theorem|cor|def|remark|example|section)\s+\{([^}]+)\}\s*$/);
    if (!match) return undefined;

    const inner = match[2];
    const idMatch = inner.match(/#([^\s}]+)/);
    if (!idMatch) return undefined;

    const titleMatch = inner.match(/title="([^"]*)"/);
    return {
        type: match[1],
        id: idMatch[1],
        title: titleMatch ? titleMatch[1] : ''
    };
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

    if (pending.unit.chapter !== undefined) label.chapter = pending.unit.chapter;
    if (pending.unit.appendix !== undefined) label.appendix = pending.unit.appendix;
    if (INCREMENTAL_TYPES.has(pending.type)) label.number = itemNumber;
    if (SECTION_TYPES.has(pending.type)) label.number = sectionNumber;
    if (pending.volume) {
        label.volumeKey = pending.volume.key;
        label.volumeTitle = pending.volume.title;
        label.volumeOrder = pending.volume.order;
    }
    return label;
}

export function scanFormalDocuments(documents: FormalDocument[], configInput: any) {
    const config = mergeConfig(configInput);
    const files = [...documents].sort((a, b) => a.filePath.localeCompare(b.filePath));
    const labels: Record<string, LabelData> = {};
    const definitions: FormalDefinition[] = [];
    const references: FormalReference[] = [];
    const pages: PageData[] = [];
    const issues: FormalIssue[] = [];
    const unitFiles = new Map<string, UnitFile[]>();

    for (const document of files) {
        const filePath = toPosix(document.filePath);
        const basename = path.posix.basename(filePath);
        const content = document.content;
        const book = inferBookInfo(filePath, config);
        const volume = inferVolumeInfo(filePath, config);
        const unit = parseNumberingUnit(basename);
        const specialKind = parseSpecialPageKind(basename);

        if (unit || specialKind) {
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

        collectReferences(content, filePath, references);
        const blockStarts = collectBlockStarts(content, filePath, issues);
        if (blockStarts.length > 0 && !unit) {
            issues.push({
                severity: 'warn',
                code: 'formal-block-outside-numbered-file',
                file: filePath,
                message: 'Formal blocks are only numbered in NN-title.md or appendix-a-title.md files.'
            });
        }

        if (!unit) continue;
        const volumeKey = volume?.key || '__root__';
        const scopeKey = unit.kind === 'appendix' ? `${book.key}:${volumeKey}:${unit.key}` : `${book.key}:${unit.key}`;
        if (!unitFiles.has(scopeKey)) unitFiles.set(scopeKey, []);
        unitFiles.get(scopeKey)!.push({ filePath, content, book, volume, unit });
    }

    for (const groupFiles of unitFiles.values()) {
        groupFiles.sort((a, b) => a.filePath.localeCompare(b.filePath));
        let itemCounter = 1;
        let sectionCounter = 1;

        for (const unitFile of groupFiles) {
            const lines = unitFile.content.split(/\r?\n/);
            let pending: PendingBlock | undefined;
            let inFence = false;

            for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
                const line = lines[lineIndex];
                if (/^\s*(```|~~~)/.test(line)) {
                    inFence = !inFence;
                    if (pending) pending.contentLines.push(line);
                    continue;
                }

                if (pending) {
                    if (!inFence && /^:::\s*$/.test(line)) {
                        const itemNumber = INCREMENTAL_TYPES.has(pending.type) ? itemCounter++ : undefined;
                        const sectionNumber = SECTION_TYPES.has(pending.type) ? sectionCounter++ : undefined;
                        const label = makeLabelData(pending, itemNumber, sectionNumber, lineIndex);
                        labels[pending.id] = label;
                        definitions.push({
                            id: pending.id,
                            type: pending.type,
                            title: pending.title,
                            file: pending.filePath,
                            line: pending.startLine + 1,
                            label
                        });
                        pending = undefined;
                        continue;
                    }
                    pending.contentLines.push(line);
                    continue;
                }

                if (inFence) continue;
                const block = parseFormalBlockStart(line);
                if (!block) continue;
                pending = {
                    ...block,
                    filePath: unitFile.filePath,
                    book: unitFile.book,
                    volume: unitFile.volume,
                    unit: unitFile.unit,
                    startLine: lineIndex,
                    contentLines: []
                };
            }

            if (pending) {
                issues.push({
                    severity: 'error',
                    code: 'unclosed-formal-block',
                    file: pending.filePath,
                    line: pending.startLine + 1,
                    message: `Missing closing ::: for #${pending.id}.`
                });
            }
        }
    }

    issues.push(...lintDefinitions(definitions));
    issues.push(...lintReferences(references, labels, definitions));
    issues.push(...lintPages(pages));

    definitions.sort(compareDefinitionRecords);
    pages.sort(comparePages);
    const inventory = buildInventory(definitions, config);
    return { config, files: files.map(file => file.filePath), labels, pages, definitions, references, inventory, issues };
}

function collectBlockStarts(content: string, filePath: string, issues: FormalIssue[]): any[] {
    const starts = [];
    const lines = content.split(/\r?\n/);
    let inFence = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/^\s*(```|~~~)/.test(line)) {
            inFence = !inFence;
            continue;
        }
        if (inFence) continue;
        const block = parseFormalBlockStart(line);
        if (block) starts.push({ ...block, file: filePath, line: i + 1 });
        const malformed = line.match(/^:::(prop|lemma|theorem|cor|def|remark|example|section)\b/);
        if (malformed && !block) {
            issues.push({
                severity: 'error',
                code: 'malformed-formal-block',
                file: filePath,
                line: i + 1,
                message: 'Formal block start must be :::type {#id title="..."} on one line.'
            });
        }
    }
    return starts;
}

function collectReferences(content: string, filePath: string, references: FormalReference[]): void {
    const stripped = stripIgnoredMarkdown(content);
    const lineStarts = [0];
    for (let i = 0; i < stripped.length; i++) {
        if (stripped[i] === '\n') lineStarts.push(i + 1);
    }

    const refRe = /(^|[^A-Za-z0-9_])@([A-Za-z0-9_-]+)(?:\.title)?\b/g;
    let match;
    while ((match = refRe.exec(stripped))) {
        const offset = match.index + match[1].length;
        const line = findLineForOffset(lineStarts, offset);
        references.push({ id: match[2], file: filePath, line });
    }
}

function findLineForOffset(lineStarts: number[], offset: number): number {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (lineStarts[mid] <= offset) low = mid + 1;
        else high = mid - 1;
    }
    return high + 1;
}

function lintDefinitions(definitions: FormalDefinition[]): FormalIssue[] {
    const issues: FormalIssue[] = [];
    const byId = new Map<string, FormalDefinition[]>();
    for (const def of definitions) {
        if (!byId.has(def.id)) byId.set(def.id, []);
        byId.get(def.id)!.push(def);

        if (TMP_ID_RE.test(def.id)) {
            issues.push({
                severity: 'error',
                code: 'tmp-id-left',
                file: def.file,
                line: def.line,
                message: `Temporary id #${def.id} remains. Run npm run formal -- finalize <file>.`
            });
        } else if (!HASH_ID_RE.test(def.id)) {
            issues.push({
                severity: 'warn',
                code: 'non-hash-id',
                file: def.file,
                line: def.line,
                message: `Formal id #${def.id} is not a pure hash id.`
            });
        }
    }

    for (const [id, defs] of byId) {
        if (defs.length <= 1) continue;
        defs.forEach(def => {
            issues.push({
                severity: 'error',
                code: 'duplicate-id',
                file: def.file,
                line: def.line,
                message: `Duplicate formal id #${id}.`
            });
        });
    }
    return issues;
}

function lintReferences(references: FormalReference[], labels: Record<string, LabelData>, definitions: FormalDefinition[]): FormalIssue[] {
    const issues: FormalIssue[] = [];
    const definedIds = new Set(Object.keys(labels));
    const tmpDefs = new Set(definitions.filter(def => TMP_ID_RE.test(def.id)).map(def => def.id));
    for (const ref of references) {
        if (TMP_ID_RE.test(ref.id)) {
            issues.push({
                severity: tmpDefs.has(ref.id) ? 'error' : 'error',
                code: 'tmp-ref-left',
                file: ref.file,
                line: ref.line,
                message: `Temporary reference @${ref.id} remains. Run finalize before committing.`
            });
            continue;
        }
        if (!definedIds.has(ref.id)) {
            issues.push({
                severity: 'error',
                code: 'missing-ref',
                file: ref.file,
                line: ref.line,
                message: `Reference @${ref.id} has no matching formal block.`
            });
        }
    }
    return issues;
}

function lintPages(pages: PageData[]): FormalIssue[] {
    const issues: FormalIssue[] = [];
    const chaptersByBook = new Map<string, PageData[]>();
    const specialByScope = new Map<string, PageData[]>();

    for (const page of pages) {
        if (page.kind === 'chapter' && typeof page.chapter === 'number') {
            if (!chaptersByBook.has(page.bookKey || '')) chaptersByBook.set(page.bookKey || '', []);
            chaptersByBook.get(page.bookKey || '')!.push(page);
        }
        if (page.kind === 'intro' || page.kind === 'summary') {
            const key = `${page.bookKey}:${page.volumeKey || '__root__'}:${page.kind}`;
            if (!specialByScope.has(key)) specialByScope.set(key, []);
            specialByScope.get(key)!.push(page);
        }
    }

    for (const chapterPages of chaptersByBook.values()) {
        const sorted = [...chapterPages].sort((a, b) => (a.chapter || 0) - (b.chapter || 0));
        for (let i = 1; i < sorted.length; i++) {
            if (sorted[i].chapter === sorted[i - 1].chapter) {
                issues.push({
                    severity: 'error',
                    code: 'duplicate-chapter',
                    file: sorted[i].filePath,
                    message: `Chapter ${sorted[i].chapter} is duplicated in ${sorted[i].bookTitle}.`
                });
            }
            if ((sorted[i].chapter || 0) !== (sorted[i - 1].chapter || 0) + 1) {
                issues.push({
                    severity: 'warn',
                    code: 'chapter-gap',
                    file: sorted[i].filePath,
                    message: `${sorted[i].bookTitle} jumps from chapter ${sorted[i - 1].chapter} to ${sorted[i].chapter}.`
                });
            }
        }
    }

    for (const entries of specialByScope.values()) {
        if (entries.length <= 1) continue;
        entries.slice(1).forEach(page => {
            issues.push({
                severity: 'warn',
                code: 'duplicate-special-page',
                file: page.filePath,
                message: `Duplicate ${page.kind}.md in the same book/volume scope.`
            });
        });
    }

    return issues;
}

function comparePages(a: PageData, b: PageData): number {
    if ((a.bookOrder || 0) !== (b.bookOrder || 0)) return (a.bookOrder || 0) - (b.bookOrder || 0);
    if ((a.volumeOrder || 0) !== (b.volumeOrder || 0)) return (a.volumeOrder || 0) - (b.volumeOrder || 0);
    if (a.order !== b.order) return a.order - b.order;
    return a.filePath.localeCompare(b.filePath);
}

function compareDefinitionRecords(a: FormalDefinition, b: FormalDefinition): number {
    const la = a.label;
    const lb = b.label;
    if ((la.bookOrder || 0) !== (lb.bookOrder || 0)) return (la.bookOrder || 0) - (lb.bookOrder || 0);
    if ((la.volumeOrder || 0) !== (lb.volumeOrder || 0)) return (la.volumeOrder || 0) - (lb.volumeOrder || 0);
    if ((la.unitOrder || 0) !== (lb.unitOrder || 0)) return (la.unitOrder || 0) - (lb.unitOrder || 0);
    return a.file.localeCompare(b.file) || a.line - b.line;
}

export function formatLabelNumber(label: LabelData): string {
    const prefix = label.unitLabel || (label.chapter !== undefined ? String(label.chapter) : label.appendix || '');
    return prefix && label.number !== undefined ? `${prefix}.${label.number}` : '';
}

export function displayLabel(def: FormalDefinition, config: any): string {
    const name = typeName(config, def.type);
    if (def.type === 'section') {
        const number = formatLabelNumber(def.label);
        return number ? `${name} ${number}` : name;
    }

    const number = formatLabelNumber(def.label);
    return number ? `${name} ${number}` : name;
}

export function displayNumber(def: FormalDefinition): string {
    return formatLabelNumber(def.label);
}

export function buildInventory(definitions: FormalDefinition[], config: any): Record<string, any> {
    const inventory: Record<string, any> = {};
    for (const def of definitions) {
        inventory[def.id] = {
            type: def.type,
            display: displayLabel(def, config),
            title: def.title,
            file: def.file,
            line: def.line,
            book: def.label.bookTitle,
            unit: def.label.unitKey,
            preview: def.label.contentPreview,
            content: def.label.content
        };
    }
    return inventory;
}

export function renderReferenceMap(definitions: FormalDefinition[], config: any): string {
    const lines = [
        '# Reference Map',
        '',
        'Generated by `npm run formal -- prepare`. Read this file to map human display numbers to stable hash IDs.',
        ''
    ];

    let currentBook = '';
    for (const def of definitions) {
        const book = def.label.bookTitle || 'Workspace';
        if (book !== currentBook) {
            currentBook = book;
            lines.push(`## ${book}`, '');
            lines.push('| Display | ID | Title | Location |');
            lines.push('| --- | --- | --- | --- |');
        }
        const title = def.title || '';
        lines.push(`| ${displayLabel(def, config)} | \`${def.id}\` | ${escapeTable(title)} | \`${def.file}:${def.line}\` |`);
    }

    lines.push('');
    return `${lines.join('\n')}\n`;
}

export function renderAgentGuide(state: any): string {
    const errors = state.issues.filter((issue: FormalIssue) => issue.severity === 'error').length;
    const warnings = state.issues.filter((issue: FormalIssue) => issue.severity !== 'error').length;
    const lines = [
        '# Agent Guide',
        '',
        'Generated by `npm run formal -- prepare`. This is the compact workflow card for AI agents.',
        '',
        `Current cache: ${Object.keys(state.labels).length} labels, ${state.pages.length} pages, ${errors} errors, ${warnings} warnings.`,
        '',
        '## Normal Writing',
        '',
        '1. Read the target Markdown file.',
        '2. Read `.markdown-formal/reference-map.md` to map display numbers to stable hash IDs.',
        '3. Reference existing objects with `@h-...` or `@h-....title`; never handwrite display numbers as references.',
        '4. Create new objects with temporary IDs such as `tmp-1`, `tmp-2`, `tmp-3`.',
        '5. Keep Markdown and LaTeX unescaped so hover preview can render formulas.',
        '6. Run `npm run formal -- finalize <file-or-dir>` after editing.',
        '7. Run `npm run formal -- verify` before treating generated or migrated content as complete.',
        '',
        '## Gradual Migration',
        '',
        '- Text references: run `npm run formal -- migrate-text-refs --dry-run <file-or-dir>` before `--apply`.',
        '- Old semantic IDs: run `npm run formal -- migrate-ids --dry-run <file-or-dir>` before `--apply`.',
        '- If scoped ID migration reports outside references, choose a larger closed scope or use `--update-refs-all`.',
        '- Use `--all` only when intentionally migrating the whole project or cross-file temporary references.',
        '',
        '## Generated Files',
        '',
        '- `.markdown-formal/reference-map.md`: compact display-number to hash-ID table.',
        '- `.markdown-formal/inventory.full.json`: full content inventory for deeper lookup.',
        '- `.markdown-formal/report.md`: lint/verify details.',
        '- `.markdown-formal/text-ref-migration.md`: generated only after text-reference migration.',
        ''
    ];
    return `${lines.join('\n')}\n`;
}

function escapeTable(value: string): string {
    return String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

export function renderReport(state: any): string {
    const errors = state.issues.filter((issue: FormalIssue) => issue.severity === 'error');
    const warnings = state.issues.filter((issue: FormalIssue) => issue.severity !== 'error');
    const lines = [
        '# markdown-formal Report',
        '',
        `Labels: ${Object.keys(state.labels).length}`,
        `Pages: ${state.pages.length}`,
        `Errors: ${errors.length}`,
        `Warnings: ${warnings.length}`,
        ''
    ];

    if (errors.length > 0) {
        lines.push('## Errors', '');
        errors.forEach((issue: FormalIssue) => lines.push(formatIssue(issue)));
        lines.push('');
    }
    if (warnings.length > 0) {
        lines.push('## Warnings', '');
        warnings.forEach((issue: FormalIssue) => lines.push(formatIssue(issue)));
        lines.push('');
    }
    if (errors.length === 0 && warnings.length === 0) {
        lines.push('No issues found.', '');
    }

    return `${lines.join('\n')}\n`;
}

export function formatIssue(issue: FormalIssue): string {
    const location = issue.line ? `${issue.file}:${issue.line}` : issue.file || 'workspace';
    return `- [${issue.code}] ${location}: ${issue.message}`;
}
