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
    id?: string;
    type: string;
    title: string;
    file: string;
    line: number;
    label: LabelData;
}

export interface RuntimeDefinitionData {
    title: string;
    filePath: string;
    line: number;
    content: string;
    bookKey?: string;
    bookTitle?: string;
    bookOrder?: number;
    volumeKey?: string;
    volumeTitle?: string;
    volumeOrder?: number;
}

export interface FormalSymbolInput {
    pattern: string;
    display?: string;
    meaning: string;
    scope?: string;
    source?: string;
}

export interface RuntimeSymbolData {
    pattern: string;
    normalizedPattern: string;
    regex: string;
    captures: string[];
    display: string;
    meaning: string;
    scope: string;
    source?: string;
    sourceFilePath?: string;
    sourceLine?: number;
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

export interface FormalMarker {
    type: string;
    id?: string;
    title: string;
    markerText: string;
    rest: string;
    level?: number;
}

export const FORMAL_TYPES = ['prop', 'lemma', 'theorem', 'cor', 'def', 'remark', 'example', 'section'];
export const THEOREM_COUNTER_TYPES = new Set(['prop', 'lemma', 'theorem', 'cor']);
export const RECALL_TYPES = new Set(['prop', 'lemma', 'theorem', 'cor', 'remark', 'example']);
export const SECTION_TYPES = new Set(['section']);
export const HASH_ID_RE = /^h-[a-f0-9]{16,32}$/;
export const TMP_ID_RE = /^tmp-[A-Za-z0-9_-]+$/;
const SYMBOL_PLACEHOLDER_RE = /\$\{([A-Za-z][A-Za-z0-9_]*)\}/g;
const SYMBOL_SAMPLE_VALUES: Record<string, string> = {
    operator: 'T',
    ellipticOperator: 'D',
    parameter: '\\lambda',
    param: '\\lambda',
    time: 't',
    index: 'i',
    base: 'U',
    object: 'E',
    space: 'X',
    radius: 'R',
    mesh: 'h',
    left: 'x',
    right: 'y'
};

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
        .replace(/`([^`]*)`/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/^[ \t]{0,3}(?:#{1,6}\s+|>\s*|[-+*]\s+)/gm, '')
        .replace(/\s+/g, ' ')
        .trim();
    return text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}...` : text;
}

export function normalizeLatexSymbol(value: string): string {
    return String(value || '')
        .trim()
        .replace(/^\$+|\$+$/g, '')
        .replace(/\\left\s*/g, '')
        .replace(/\\right\s*/g, '')
        .replace(/\\operatorname\s*\{([^{}]+)\}/g, '\\$1')
        .replace(/\\([A-Za-z]+)\s+\{([^{}]+)\}/g, '\\$1{$2}')
        .replace(/\s+/g, '')
        .replace(/([_^])([A-Za-z0-9\\])(?![A-Za-z0-9{])/g, '$1{$2}');
}

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function compileSymbolPattern(pattern: string): { normalizedPattern: string; regex: string; captures: string[] } {
    const normalizedPattern = normalizeLatexSymbol(pattern);
    const captures: string[] = [];
    let regex = '^';
    let cursor = 0;
    let match: RegExpExecArray | null;
    SYMBOL_PLACEHOLDER_RE.lastIndex = 0;

    while ((match = SYMBOL_PLACEHOLDER_RE.exec(normalizedPattern))) {
        regex += escapeRegex(normalizedPattern.slice(cursor, match.index));
        captures.push(match[1]);
        regex += '(.+?)';
        cursor = match.index + match[0].length;
    }

    regex += escapeRegex(normalizedPattern.slice(cursor));
    regex += '$';
    return { normalizedPattern, regex, captures };
}

function parseSymbolSource(source: string | undefined): { sourceFilePath?: string; sourceLine?: number } {
    if (!source) return {};
    const match = String(source).match(/^(.+?)(?::(\d+))?$/);
    if (!match) return {};
    return {
        sourceFilePath: toPosix(match[1]).replace(/^\/+/, ''),
        sourceLine: match[2] ? Number(match[2]) : undefined
    };
}

function symbolSampleValue(name: string): string {
    return SYMBOL_SAMPLE_VALUES[name] || 'x';
}

function makeSymbolDisplay(pattern: string): string {
    return `$${pattern.replace(/\$\{([A-Za-z][A-Za-z0-9_]*)\}/g, (_match, name) => symbolSampleValue(name))}$`;
}

function normalizeSymbolDocuments(documents: Array<FormalDocument | string>): FormalDocument[] {
    return documents.map(document => typeof document === 'string'
        ? { filePath: document, content: '' }
        : document
    );
}

export function parseFormalSymbols(input: unknown, documents: Array<FormalDocument | string> = []): { symbols: RuntimeSymbolData[]; issues: FormalIssue[] } {
    const issues: FormalIssue[] = [];
    const rawSymbols = Array.isArray(input)
        ? input
        : input && typeof input === 'object' && Array.isArray((input as any).symbols)
            ? (input as any).symbols
            : [];

    if (input !== undefined && input !== null && !Array.isArray(input) && !(typeof input === 'object' && Array.isArray((input as any).symbols))) {
        issues.push({
            severity: 'error',
            code: 'invalid-symbols-file',
            file: 'formal-symbols.json',
            message: 'formal-symbols.json must be an array, or an object with a symbols array.'
        });
        return { symbols: [], issues };
    }

    const normalizedDocuments = normalizeSymbolDocuments(documents);
    const fileSet = new Set(normalizedDocuments.map(document => toPosix(document.filePath).replace(/^\/+/, '')));
    const lineCounts = new Map(normalizedDocuments.map(document => [
        toPosix(document.filePath).replace(/^\/+/, ''),
        document.content ? document.content.split(/\r\n|\r|\n/).length : 0
    ]));
    const seen = new Map<string, number>();
    const symbols: RuntimeSymbolData[] = [];
    rawSymbols.forEach((item: any, index: number) => {
        if (!item || typeof item !== 'object') {
            issues.push({
                severity: 'error',
                code: 'invalid-symbol-entry',
                file: 'formal-symbols.json',
                line: index + 1,
                message: 'Symbol entry must be an object.'
            });
            return;
        }

        const pattern = typeof item.pattern === 'string' ? item.pattern.trim() : '';
        const meaning = typeof item.meaning === 'string' ? item.meaning.trim() : '';
        const source = typeof item.source === 'string' && item.source.trim() ? item.source.trim() : '';
        if (!pattern || !meaning || !source) {
            issues.push({
                severity: 'error',
                code: 'invalid-symbol-entry',
                file: 'formal-symbols.json',
                line: index + 1,
                message: 'Symbol entry requires non-empty source, pattern, and meaning.'
            });
            return;
        }

        const compiled = compileSymbolPattern(pattern);
        const display = typeof item.display === 'string' && item.display.trim() ? item.display.trim() : makeSymbolDisplay(pattern);
        const scope = typeof item.scope === 'string' && item.scope.trim() ? item.scope.trim() : 'book';
        const parsedSource = parseSymbolSource(source);

        if (!parsedSource.sourceFilePath || parsedSource.sourceLine === undefined) {
            issues.push({
                severity: 'error',
                code: 'symbol-source-invalid',
                file: 'formal-symbols.json',
                line: index + 1,
                message: `Symbol source ${source} must use path.md:line format.`
            });
            return;
        }

        if (fileSet.size > 0 && !fileSet.has(parsedSource.sourceFilePath)) {
            issues.push({
                severity: 'error',
                code: 'symbol-source-missing',
                file: 'formal-symbols.json',
                line: index + 1,
                message: `Symbol source ${source} does not point to a known Markdown file.`
            });
            return;
        }

        const lineCount = lineCounts.get(parsedSource.sourceFilePath) || 0;
        if (lineCount > 0 && (parsedSource.sourceLine < 1 || parsedSource.sourceLine > lineCount)) {
            issues.push({
                severity: 'error',
                code: 'symbol-source-line-missing',
                file: 'formal-symbols.json',
                line: index + 1,
                message: `Symbol source ${source} points outside the source file.`
            });
            return;
        }

        if (!new RegExp(compiled.regex).test(normalizeLatexSymbol(display))) {
            issues.push({
                severity: 'warn',
                code: 'symbol-display-mismatch',
                file: 'formal-symbols.json',
                line: index + 1,
                message: `Symbol display ${display} does not match pattern ${pattern}.`
            });
        }

        if (/^\$\{[A-Za-z][A-Za-z0-9_]*\}$/.test(compiled.normalizedPattern)) {
            issues.push({
                severity: 'warn',
                code: 'symbol-pattern-too-broad',
                file: 'formal-symbols.json',
                line: index + 1,
                message: `Symbol pattern ${pattern} is only a placeholder and may match unrelated formulas.`
            });
        }

        const duplicateKey = `${scope}:${compiled.normalizedPattern}:${parsedSource.sourceFilePath}`;
        const previousIndex = seen.get(duplicateKey);
        if (previousIndex !== undefined) {
            issues.push({
                severity: 'warn',
                code: 'duplicate-symbol-pattern',
                file: 'formal-symbols.json',
                line: index + 1,
                message: `Symbol pattern duplicates entry ${previousIndex + 1} in the same scope and source file.`
            });
        }
        seen.set(duplicateKey, index);

        symbols.push({
            pattern,
            normalizedPattern: compiled.normalizedPattern,
            regex: compiled.regex,
            captures: compiled.captures,
            display,
            meaning,
            scope,
            source,
            ...parsedSource
        });
    });

    return { symbols, issues };
}

export function stripIgnoredMarkdown(content: string): string {
    return content
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/```[\s\S]*?```/g, '')
        .replace(/~~~[\s\S]*?~~~/g, '')
        .replace(/`[^`\n]*`/g, '');
}

const MARKER_TYPE_ALIASES: Record<string, string> = {
    '命题': 'prop',
    '引理': 'lemma',
    '定理': 'theorem',
    '推论': 'cor',
    '定义': 'def',
    '注': 'remark',
    '例': 'example',
    proposition: 'prop',
    prop: 'prop',
    lemma: 'lemma',
    lem: 'lemma',
    theorem: 'theorem',
    thm: 'theorem',
    corollary: 'cor',
    cor: 'cor',
    definition: 'def',
    def: 'def',
    remark: 'remark',
    rem: 'remark',
    example: 'example',
    ex: 'example'
};

function normalizeMarkerType(value: string): string | undefined {
    return MARKER_TYPE_ALIASES[value.toLowerCase()] || MARKER_TYPE_ALIASES[value];
}

function extractMarkerTitle(type: string, rest: string): string {
    const trimmed = rest.trim();
    if (!trimmed) return '';

    const paren = trimmed.match(/^[（(]([^）)]+)[）)]/);
    if (paren) return paren[1].trim();

    if (type === 'def') {
        const term = trimmed.match(/^([^：:\n，,。.;；]+)[：:]/);
        if (term) return term[1].trim();
    }

    return '';
}

export function parseFormalMarkerLine(line: string): FormalMarker | undefined {
    const heading = line.match(/^(#{2,6})\s+#([A-Za-z0-9_-]+)\s+(.+?)\s*$/);
    if (heading) {
        return {
            type: 'section',
            id: heading[2],
            title: heading[3].trim(),
            markerText: `#${heading[2]}`,
            rest: heading[3].trim(),
            level: heading[1].length
        };
    }

    const text = line.trim();
    const typePattern = '定理|引理|命题|推论|定义|注|例|Theorem|Thm\\.?|Lemma|Lem\\.?|Proposition|Prop\\.?|Corollary|Cor\\.?|Definition|Def\\.?|Remark|Rem\\.?|Example|Ex\\.?';
    const typed = text.match(new RegExp(`^(${typePattern})\\s*(.*)$`, 'i'));
    if (!typed) return undefined;

    const type = normalizeMarkerType(typed[1].replace(/\.$/, ''));
    if (!type) return undefined;

    if (type === 'def') {
        const rest = typed[2] || '';
        if (!/^\s*[（(]/.test(rest)) return undefined;
        const title = extractMarkerTitle(type, rest);
        if (!title) return undefined;
        return {
            type,
            title,
            markerText: typed[1],
            rest
        };
    }

    const match = text.match(new RegExp(`^(${typePattern})\\s+#([A-Za-z0-9_-]+)\\b\\s*(.*)$`, 'i'));
    if (!match) return undefined;

    const rest = match[3] || '';
    return {
        type,
        id: match[2],
        title: extractMarkerTitle(type, rest),
        markerText: `${match[1]} #${match[2]}`,
        rest
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

function markerLineContent(line: string, marker: FormalMarker): string {
    if (marker.type === 'section') return marker.title;
    return line.trim().replace(marker.markerText, sourceMarkerLabel(marker)).trim();
}

function sourceMarkerLabel(marker: FormalMarker): string {
    return marker.markerText.replace(/\s+#[A-Za-z0-9_-]+\b$/, '').trim();
}

function normalizeProofBoundaryLine(line: string): string {
    return line
        .trim()
        .replace(/^>\s*/, '')
        .replace(/^\s*[-+*]\s+/, '')
        .replace(/^\*\*(.+?)\*\*/, '$1')
        .replace(/^__(.+?)__/, '$1')
        .replace(/^\*(.+?)\*/, '$1')
        .replace(/^_(.+?)_/, '$1')
        .trim();
}

function isProofBoundaryLine(line: string): boolean {
    const text = normalizeProofBoundaryLine(line);
    return /^(?:证明(?:概要|草图|思路|如下|在此略去)?|Proof(?:\s+sketch)?|Sketch of proof)\s*(?:[：:。.．.]|$|\s)/i.test(text);
}

function isMarkerBoundaryLine(line: string): boolean {
    return /^#{1,6}\s+/.test(line) || !!parseFormalMarkerLine(line);
}

function trimTrailingBlankLines(lines: string[]): string[] {
    const trimmed = [...lines];
    while (trimmed.length > 0 && !trimmed[trimmed.length - 1].trim()) trimmed.pop();
    return trimmed;
}

function collectRecallMarkerContent(lines: string[], startLine: number, marker: FormalMarker): { contentLines: string[]; endLine: number } {
    const contentLines = [markerLineContent(lines[startLine], marker)];
    let endLine = startLine;
    let proofLine = -1;

    for (let i = startLine + 1; i < lines.length; i++) {
        const line = lines[i];
        if (isMarkerBoundaryLine(line)) break;
        if (isProofBoundaryLine(line)) {
            proofLine = i;
            break;
        }
    }

    if (proofLine >= 0) {
        for (let i = startLine + 1; i < proofLine; i++) {
            contentLines.push(lines[i]);
            endLine = i;
        }
        return { contentLines: trimTrailingBlankLines(contentLines), endLine };
    }

    for (let i = startLine + 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) break;
        if (isMarkerBoundaryLine(line)) break;
        contentLines.push(line);
        endLine = i;
    }

    return { contentLines: trimTrailingBlankLines(contentLines), endLine };
}

function collectMarkerContent(lines: string[], startLine: number, marker: FormalMarker): { contentLines: string[]; endLine: number } {
    if (RECALL_TYPES.has(marker.type)) {
        return collectRecallMarkerContent(lines, startLine, marker);
    }

    const contentLines = [markerLineContent(lines[startLine], marker)];
    let endLine = startLine;

    for (let i = startLine + 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) break;
        if (isMarkerBoundaryLine(line)) break;
        contentLines.push(line);
        endLine = i;
    }

    return { contentLines: trimTrailingBlankLines(contentLines), endLine };
}

function makeLabelData(marker: FormalMarker, unitFile: UnitFile, startLine: number, contentLines: string[], markerNumber?: number, endLine?: number): LabelData {
    const content = RECALL_TYPES.has(marker.type) ? contentLines.join('\n') : undefined;
    const label: LabelData = {
        type: marker.type,
        title: marker.title,
        filePath: unitFile.filePath,
        bookKey: unitFile.book.key,
        bookTitle: unitFile.book.title,
        bookOrder: unitFile.book.order,
        unitKind: unitFile.unit.kind,
        unitKey: unitFile.unit.key,
        unitLabel: unitFile.unit.label,
        unitOrder: unitFile.unit.order,
        startLine,
        endLine
    };

    if (content) label.content = content;
    if (unitFile.unit.chapter !== undefined) label.chapter = unitFile.unit.chapter;
    if (unitFile.unit.appendix !== undefined) label.appendix = unitFile.unit.appendix;
    if (markerNumber !== undefined) label.number = markerNumber;
    if (unitFile.volume) {
        label.volumeKey = unitFile.volume.key;
        label.volumeTitle = unitFile.volume.title;
        label.volumeOrder = unitFile.volume.order;
    }
    return label;
}

function makeDefinitionLabelData(marker: FormalMarker, document: FormalDocument, book: BookInfo, volume: VolumeInfo | undefined, startLine: number, contentLines: string[], endLine?: number): LabelData {
    const content = contentLines.join('\n');
    const label: LabelData = {
        type: marker.type,
        title: marker.title,
        filePath: document.filePath,
        bookKey: book.key,
        bookTitle: book.title,
        bookOrder: book.order,
        content,
        startLine,
        endLine
    };
    if (volume) {
        label.volumeKey = volume.key;
        label.volumeTitle = volume.title;
        label.volumeOrder = volume.order;
    }
    return label;
}

export function scanFormalDocuments(documents: FormalDocument[], configInput: any, symbolsInput?: unknown) {
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
        const markerStarts = collectMarkerStarts(content, filePath);
        if (markerStarts.some(marker => marker.type !== 'def') && !unit) {
            issues.push({
                severity: 'warn',
                code: 'formal-marker-outside-numbered-file',
                file: filePath,
                message: 'Numbered markers are only numbered in NN-title.md or appendix-a-title.md files.'
            });
        }

        const lines = content.split(/\r?\n/);
        let inFence = false;
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex];
            if (/^\s*(```|~~~)/.test(line)) {
                inFence = !inFence;
                continue;
            }
            if (inFence) continue;
            const marker = parseFormalMarkerLine(line);
            if (!marker || marker.type !== 'def') continue;

            const collected = collectMarkerContent(lines, lineIndex, marker);
            const label = makeDefinitionLabelData(marker, { filePath, content }, book, volume, lineIndex, collected.contentLines, collected.endLine);
            definitions.push({
                type: marker.type,
                title: marker.title,
                file: filePath,
                line: lineIndex + 1,
                label
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
        let remarkCounter = 1;
        let exampleCounter = 1;

        for (const unitFile of groupFiles) {
            const lines = unitFile.content.split(/\r?\n/);
            let inFence = false;

            for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
                const line = lines[lineIndex];
                if (/^\s*(```|~~~)/.test(line)) {
                    inFence = !inFence;
                    continue;
                }
                if (inFence) continue;
                const marker = parseFormalMarkerLine(line);
                if (!marker) continue;
                if (marker.type === 'def') continue;

                let markerNumber: number | undefined;
                if (THEOREM_COUNTER_TYPES.has(marker.type)) {
                    markerNumber = itemCounter++;
                } else if (SECTION_TYPES.has(marker.type)) {
                    markerNumber = sectionCounter++;
                } else if (marker.type === 'remark') {
                    markerNumber = remarkCounter++;
                } else if (marker.type === 'example') {
                    markerNumber = exampleCounter++;
                }
                const content = collectMarkerContent(lines, lineIndex, marker);
                const label = makeLabelData(marker, unitFile, lineIndex, content.contentLines, markerNumber, content.endLine);
                labels[marker.id!] = label;
                definitions.push({
                    id: marker.id!,
                    type: marker.type,
                    title: marker.title,
                    file: unitFile.filePath,
                    line: lineIndex + 1,
                    label
                });
            }
        }
    }

    const symbolResult = parseFormalSymbols(symbolsInput, files);
    issues.push(...symbolResult.issues);
    issues.push(...lintDefinitions(definitions));
    issues.push(...lintReferences(references, labels, definitions));
    issues.push(...lintPages(pages));

    definitions.sort(compareDefinitionRecords);
    pages.sort(comparePages);
    return { config, files: files.map(file => file.filePath), labels, pages, definitions, references, symbols: symbolResult.symbols, issues };
}

function collectMarkerStarts(content: string, filePath: string): any[] {
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
        const marker = parseFormalMarkerLine(line);
        if (marker) starts.push({ ...marker, file: filePath, line: i + 1 });
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
        if (!def.id) continue;
        if (!byId.has(def.id)) byId.set(def.id, []);
        byId.get(def.id)!.push(def);

        if (TMP_ID_RE.test(def.id)) {
            issues.push({
                severity: 'error',
                code: 'tmp-id-left',
                file: def.file,
                line: def.line,
                message: `Temporary marker #${def.id} remains. Run npm run formal -- finish <file>.`
            });
        } else if (!HASH_ID_RE.test(def.id)) {
            issues.push({
                severity: 'warn',
                code: 'non-hash-id',
                file: def.file,
                line: def.line,
                message: `Marker id #${def.id} is not a pure hash id.`
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
                message: `Duplicate marker id #${id}.`
            });
        });
    }
    return issues;
}

function lintReferences(references: FormalReference[], labels: Record<string, LabelData>, definitions: FormalDefinition[]): FormalIssue[] {
    const issues: FormalIssue[] = [];
    const definedIds = new Set(Object.keys(labels));
    const tmpDefs = new Set(definitions.filter(def => def.id && TMP_ID_RE.test(def.id)).map(def => def.id as string));
    for (const ref of references) {
        if (TMP_ID_RE.test(ref.id)) {
            issues.push({
                severity: tmpDefs.has(ref.id) ? 'error' : 'error',
                code: 'tmp-ref-left',
                file: ref.file,
                line: ref.line,
                message: `Temporary reference @${ref.id} remains. Run finish before committing.`
            });
            continue;
        }
        if (!definedIds.has(ref.id)) {
            issues.push({
                severity: 'error',
                code: 'missing-ref',
                file: ref.file,
                line: ref.line,
                message: `Reference @${ref.id} has no matching marker.`
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

export function renderReferenceMap(definitions: FormalDefinition[], config: any): string {
    const lines = [
        '# Reference Map',
        '',
        'Generated by `npm run formal -- prepare`. Read this file to map human display numbers to stable hash IDs.',
        ''
    ];

    let currentBook = '';
    for (const def of definitions.filter(def => def.id && displayNumber(def))) {
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

export function buildRuntimeDefinitions(definitions: FormalDefinition[]): RuntimeDefinitionData[] {
    return definitions
        .filter(def => def.type === 'def')
        .map(def => ({
            title: def.title,
            filePath: def.file,
            line: def.line,
            content: def.label.content || '',
            bookKey: def.label.bookKey,
            bookTitle: def.label.bookTitle,
            bookOrder: def.label.bookOrder,
            volumeKey: def.label.volumeKey,
            volumeTitle: def.label.volumeTitle,
            volumeOrder: def.label.volumeOrder
        }));
}

export function buildPreviewCache(state: any) {
    return {
        entries: state.labels,
        pages: state.pages,
        definitions: buildRuntimeDefinitions(state.definitions || []),
        symbols: state.symbols || []
    };
}

export function renderAgentGuide(state: any): string {
    const errors = state.issues.filter((issue: FormalIssue) => issue.severity === 'error').length;
    const warnings = state.issues.filter((issue: FormalIssue) => issue.severity !== 'error').length;
    const lines = [
        '# Agent Guide',
        '',
        'Generated by `npm run formal -- prepare`. This is the compact workflow card for AI agents.',
        '',
        `Current cache: ${Object.keys(state.labels).length} preview entries, ${state.pages.length} pages, ${(state.symbols || []).length} symbols, ${errors} errors, ${warnings} warnings.`,
        '',
        '## Normal Writing',
        '',
        '1. Read the target Markdown file.',
        '2. Read `.markdown-formal/reference-map.md` to map display numbers to stable hash IDs.',
        '3. Put stable IDs directly where numbers used to appear: `## #tmp-1 Section`, `定理 #tmp-2（Title）：...`, or `Theorem #tmp-2 (Title): ...`. Definitions stay plain: `定义（Term）：...` or `Definition (Term): ...`.',
        '4. Reference numbered objects with `@h-...`; never handwrite display numbers as references.',
        '5. Keep Markdown and LaTeX unescaped.',
        '6. Run `npm run formal -- finish <file-or-dir>` after editing; it finalizes temporary IDs and verifies the workspace.',
        '7. If you use `finalize` directly, also run `npm run formal -- verify` before treating generated or migrated content as complete.',
        '',
        '## Lightweight Syntax',
        '',
        '- Sections: `## #h-... Title` renders as the current section number plus title, and links jump to the section without hover recall.',
        '- Numbered objects: `命题 #h-...（Title）：...`, `引理 #h-...`, `定理 #h-...`, `推论 #h-...` share the theorem counter per chapter or appendix.',
        '- Theorem-like recall captures the statement before `证明` / `Proof`; keep proofs after an explicit proof marker.',
        '- Definitions: `定义（Term）：...` and `Definition (Term): ...` enter the preview definition search only; they do not have hash IDs and do not participate in automatic reference migration.',
        '- Remarks/examples stay plain by default. Only when later text already cites one, convert that exact item to `注 #tmp-*` / `例 #tmp-*` and run `finish`.',
        '- Symbols: maintain only project-specific `source`, `pattern`, and `meaning` entries in `formal-symbols.json`; do not list generic math notation.',
        '- Appendices use the appendix file prefix, so markers in `appendix-a-*.md` render as `A.1`, `A.2`, etc.',
        '',
        '## Generated Files',
        '',
        '- `.markdown-formal/reference-map.md`: compact display-number to hash-ID table.',
        '- `.markdown-formal/preview-cache.json`: runtime preview/navigation/definition/symbol lookup cache.',
        '- `.markdown-formal/report.md`: lint/verify details.',
        '- `.markdown-formal/text-ref-migration.md`: generated only after text-reference migration.',
        '',
        '## Migration',
        '',
        '- Use `npm run formal -- migrate-text-refs <file-or-dir>` before applying old numbered prose migration; migration commands are dry-run by default.',
        '- Scoped migrations update target files plus incoming references by default. Use `--target-only` only when intentionally restricting rewrites to the target files.',
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
        `Symbols: ${(state.symbols || []).length}`,
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
