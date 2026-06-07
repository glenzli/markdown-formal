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
    aliases?: string[];
}

export interface RuntimeDefinitionData {
    title: string;
    aliases?: string[];
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

export interface FormalDefinitionInput {
    term?: string;
    title?: string;
    aliases?: string[];
    source?: string;
    content?: string;
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

export interface FormalPageReference {
    kind: 'chapter' | 'page';
    target: string;
    rawTarget: string;
    mode?: 'title' | 'full';
    file: string;
    line: number;
}

export type DependencyEdgeWhere = 'statement' | 'proof' | 'body';
export type DependencyGraphWhereFilter = DependencyEdgeWhere | 'all';
export type DependencyGraphMatrixScope = 'book' | 'volume' | 'chapter';

export interface DependencyGraphNode {
    id: string;
    kind: string;
    display: string;
    title: string;
    path: string;
    line: number;
    endLine?: number;
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
    number?: number;
}

export interface DependencyGraphEdge {
    from: string;
    to: string;
    kind: 'explicit_ref';
    where: DependencyEdgeWhere;
    path: string;
    line: number;
}

export interface DependencyGraphDiagnostic {
    severity: 'info' | 'warn';
    code: string;
    file?: string;
    line?: number;
    message: string;
}

export interface DependencyGraphCycle {
    ids: string[];
    displays: string[];
}

export interface DependencyGraph {
    schemaVersion: 1;
    generatedBy: 'markdown-formal';
    nodes: DependencyGraphNode[];
    edges: DependencyGraphEdge[];
    cycles: DependencyGraphCycle[];
    diagnostics: DependencyGraphDiagnostic[];
    summary: {
        nodes: number;
        edges: number;
        isolated: number;
        cycles: number;
        crossBookEdges: number;
        crossVolumeEdges: number;
        crossChapterEdges: number;
        statementEdges: number;
        proofEdges: number;
        bodyEdges: number;
    };
}

export interface FormalDocument {
    filePath: string;
    content: string;
}

interface DependencySourceBlock {
    id: string;
    file: string;
    startLine: number;
    statementEndLine: number;
    proofStartLine?: number;
    proofEndLine?: number;
    endLine: number;
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

export const FORMAL_TYPES = ['prop', 'lemma', 'theorem', 'cor', 'def', 'remark', 'example', 'section', 'equation', 'figure', 'table'];
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
const STRUCTURED_NUMBERED_TYPES = new Set(['equation', 'figure', 'table']);

export const DEFAULT_CONFIG = {
    language: 'zh',
    dictionary: {
        zh: { theorem: '定理', lemma: '引理', prop: '命题', cor: '推论', def: '定义', remark: '注', example: '例', section: '§', equation: '公式', figure: '图', table: '表' },
        en: { theorem: 'Theorem', lemma: 'Lemma', prop: 'Proposition', cor: 'Corollary', def: 'Definition', remark: 'Remark', example: 'Example', section: '§', equation: 'Equation', figure: 'Figure', table: 'Table' }
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
    },
    scan: {
        exclude: [
            '.git/**',
            '.markdown-formal/**',
            '.vscode-test/**',
            'node_modules/**',
            'out/**',
            'dist/**'
        ]
    },
    lookup: {
        bookDependencies: {}
    },
    preview: {
        ignoreHover: []
    },
    debug: {
        previewLog: false
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
        ...existing,
        language: existing.language === 'en' ? 'en' : 'zh',
        dictionary: {
            zh: { ...DEFAULT_CONFIG.dictionary.zh, ...(existing.dictionary?.zh || {}) },
            en: { ...DEFAULT_CONFIG.dictionary.en, ...(existing.dictionary?.en || {}) }
        },
        ui: {
            zh: { ...DEFAULT_CONFIG.ui.zh, ...(existing.ui?.zh || {}) },
            en: { ...DEFAULT_CONFIG.ui.en, ...(existing.ui?.en || {}) }
        },
        scan: {
            ...DEFAULT_CONFIG.scan,
            ...(existing.scan || {}),
            exclude: unique([
                ...DEFAULT_CONFIG.scan.exclude,
                ...(Array.isArray(existing.scan?.exclude) ? existing.scan.exclude.filter((item: unknown) => typeof item === 'string') : [])
            ])
        },
        lookup: {
            ...DEFAULT_CONFIG.lookup,
            ...(existing.lookup || {}),
            bookDependencies: existing.lookup?.bookDependencies && typeof existing.lookup.bookDependencies === 'object'
                ? existing.lookup.bookDependencies
                : {}
        },
        preview: {
            ...DEFAULT_CONFIG.preview,
            ignoreHover: unique([
                ...DEFAULT_CONFIG.preview.ignoreHover,
                ...(Array.isArray(existing.preview?.ignoreHover) ? existing.preview.ignoreHover.filter((item: unknown) => typeof item === 'string') : [])
            ])
        },
        debug: {
            ...DEFAULT_CONFIG.debug,
            ...(existing.debug || {}),
            previewLog: existing.debug?.previewLog === true
        }
    };
}

function normalizeScanPath(value: string): string {
    return toPosix(String(value || ''))
        .replace(/^\/+/, '')
        .replace(/\/+$/, '');
}

function globPatternToRegExp(pattern: string): RegExp {
    let source = '';
    for (let i = 0; i < pattern.length; i++) {
        const char = pattern[i];
        if (char === '*') {
            if (pattern[i + 1] === '*') {
                source += '.*';
                i++;
            } else {
                source += '[^/]*';
            }
            continue;
        }
        if (char === '?') {
            source += '[^/]';
            continue;
        }
        source += escapeRegExp(char);
    }
    return new RegExp(`^${source}$`);
}

function scanPatternMatches(filePath: string, pattern: string): boolean {
    const file = normalizeScanPath(filePath);
    const normalizedPattern = normalizeScanPath(pattern);
    if (!file || !normalizedPattern) return false;

    if (!/[*?]/.test(normalizedPattern)) {
        if (!normalizedPattern.includes('/')) {
            return file.split('/').includes(normalizedPattern);
        }
        return file === normalizedPattern || file.startsWith(`${normalizedPattern}/`);
    }

    if (normalizedPattern.endsWith('/**')) {
        const base = normalizeScanPath(normalizedPattern.slice(0, -3));
        if (file === base || file.startsWith(`${base}/`)) return true;
    }

    const direct = globPatternToRegExp(normalizedPattern);
    if (direct.test(file)) return true;

    if (!normalizedPattern.startsWith('**/') && !normalizedPattern.includes('/')) {
        return file.split('/').some(segment => direct.test(segment));
    }

    return false;
}

export function pathPatternMatches(filePath: string, pattern: string): boolean {
    return scanPatternMatches(filePath, pattern);
}

export function scanExcludePatterns(config: any): string[] {
    const merged = mergeConfig(config);
    return Array.isArray(merged.scan?.exclude) ? merged.scan.exclude : [];
}

export function shouldExcludeScanPath(filePath: string, config: any): boolean {
    return scanExcludePatterns(config).some(pattern => scanPatternMatches(filePath, pattern));
}

export function previewIgnoreHoverPatterns(config: any): string[] {
    const merged = mergeConfig(config);
    return Array.isArray(merged.preview?.ignoreHover) ? merged.preview.ignoreHover : [];
}

export function shouldIgnorePreviewHover(filePath: string, config: any): boolean {
    return previewIgnoreHoverPatterns(config).some(pattern => scanPatternMatches(filePath, pattern));
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

export function normalizeFormalPagePath(target: string, sourceFilePath = ''): string {
    let value = toPosix(String(target || '').trim()).replace(/^\/+/, '');
    if (!value) return '';

    if (/^\.\.?\//.test(value)) {
        const baseDir = sourceFilePath ? path.posix.dirname(toPosix(sourceFilePath)) : '';
        value = path.posix.join(baseDir, value);
    }

    return path.posix.normalize(value).replace(/^\.\/+/, '').replace(/^\/+/, '');
}

export function formatPageReference(page: PageData, config: any, mode: 'default' | 'title' | 'full' = 'default'): string {
    const title = page.title || page.filePath;
    let label = title;

    if (page.kind === 'chapter' && page.chapter !== undefined) {
        label = uiText(config, 'chapter', { number: String(page.chapter) });
    } else if (page.kind === 'appendix' && page.appendix) {
        label = uiText(config, 'appendix', { label: page.appendix });
    } else if (page.kind === 'intro') {
        label = uiText(config, 'intro');
    } else if (page.kind === 'summary') {
        label = uiText(config, 'summary');
    }

    if (mode === 'title') return title;
    if (mode === 'full') {
        if (!title || title === label) return label;
        const colon = getLanguage(config) === 'en' ? ': ' : '：';
        return `${label}${colon}${title}`;
    }
    return label;
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

function hasBalancedSymbolDelimiters(value: string): boolean {
    const pairs: Record<string, string> = { ')': '(', ']': '[' };
    const stack: string[] = [];
    for (const char of value) {
        if (char === '(' || char === '[') {
            stack.push(char);
            continue;
        }
        if (char === ')' || char === ']') {
            if (stack.pop() !== pairs[char]) return false;
        }
    }
    return stack.length === 0;
}

function parseSourceLocation(source: string | undefined): { sourceFilePath?: string; sourceLine?: number } {
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
            file: '.markdown-formal/symbols.json',
            message: '.markdown-formal/symbols.json must be an array, or an object with a symbols array.'
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
                file: '.markdown-formal/symbols.json',
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
                file: '.markdown-formal/symbols.json',
                line: index + 1,
                message: 'Symbol entry requires non-empty source, pattern, and meaning.'
            });
            return;
        }

        const compiled = compileSymbolPattern(pattern);
        const display = typeof item.display === 'string' && item.display.trim() ? item.display.trim() : makeSymbolDisplay(pattern);
        const scope = typeof item.scope === 'string' && item.scope.trim() ? item.scope.trim() : 'book';
        const parsedSource = parseSourceLocation(source);

        if (!parsedSource.sourceFilePath || parsedSource.sourceLine === undefined) {
            issues.push({
                severity: 'error',
                code: 'symbol-source-invalid',
                file: '.markdown-formal/symbols.json',
                line: index + 1,
                message: `Symbol source ${source} must use path.md:line format.`
            });
            return;
        }

        if (fileSet.size > 0 && !fileSet.has(parsedSource.sourceFilePath)) {
            issues.push({
                severity: 'error',
                code: 'symbol-source-missing',
                file: '.markdown-formal/symbols.json',
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
                file: '.markdown-formal/symbols.json',
                line: index + 1,
                message: `Symbol source ${source} points outside the source file.`
            });
            return;
        }

        if (!new RegExp(compiled.regex).test(normalizeLatexSymbol(display))) {
            issues.push({
                severity: 'warn',
                code: 'symbol-display-mismatch',
                file: '.markdown-formal/symbols.json',
                line: index + 1,
                message: `Symbol display ${display} does not match pattern ${pattern}.`
            });
        }

        if (/^\$\{[A-Za-z][A-Za-z0-9_]*\}$/.test(compiled.normalizedPattern)) {
            issues.push({
                severity: 'warn',
                code: 'symbol-pattern-too-broad',
                file: '.markdown-formal/symbols.json',
                line: index + 1,
                message: `Symbol pattern ${pattern} is only a placeholder and may match unrelated formulas.`
            });
        }

        if (!hasBalancedSymbolDelimiters(compiled.normalizedPattern)) {
            issues.push({
                severity: 'warn',
                code: 'symbol-pattern-unbalanced-delimiter',
                file: '.markdown-formal/symbols.json',
                line: index + 1,
                message: `Symbol pattern ${pattern} has unbalanced parentheses or brackets and may match a surrounding formula instead of the notation itself.`
            });
        }

        const duplicateKey = `${scope}:${compiled.normalizedPattern}:${parsedSource.sourceFilePath}`;
        const previousIndex = seen.get(duplicateKey);
        if (previousIndex !== undefined) {
            issues.push({
                severity: 'warn',
                code: 'duplicate-symbol-pattern',
                file: '.markdown-formal/symbols.json',
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

function normalizeDefinitionAliases(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return unique(value
        .filter(alias => typeof alias === 'string')
        .map(alias => alias.trim())
        .filter(Boolean));
}

function normalizeDefinitionContentForMatch(value: string): string {
    return value
        .normalize('NFKC')
        .replace(/\s+/g, ' ')
        .trim();
}

export function parseFormalDefinitions(input: unknown, documents: Array<FormalDocument | string> = [], configInput: any = DEFAULT_CONFIG): { definitions: FormalDefinition[]; issues: FormalIssue[] } {
    const issues: FormalIssue[] = [];
    const rawDefinitions = Array.isArray(input)
        ? input
        : input && typeof input === 'object' && Array.isArray((input as any).definitions)
            ? (input as any).definitions
            : [];

    if (input !== undefined && input !== null && !Array.isArray(input) && !(typeof input === 'object' && Array.isArray((input as any).definitions))) {
        issues.push({
            severity: 'error',
            code: 'invalid-definitions-file',
            file: '.markdown-formal/definitions.json',
            message: '.markdown-formal/definitions.json must be an array, or an object with a definitions array.'
        });
        return { definitions: [], issues };
    }

    const config = mergeConfig(configInput);
    const normalizedDocuments = normalizeSymbolDocuments(documents);
    const documentMap = new Map(normalizedDocuments.map(document => [
        toPosix(document.filePath).replace(/^\/+/, ''),
        document.content || ''
    ]));
    const seen = new Map<string, number>();
    const definitions: FormalDefinition[] = [];

    rawDefinitions.forEach((item: any, index: number) => {
        if (!item || typeof item !== 'object') {
            issues.push({
                severity: 'error',
                code: 'invalid-definition-entry',
                file: '.markdown-formal/definitions.json',
                line: index + 1,
                message: 'Definition entry must be an object.'
            });
            return;
        }

        const title = typeof item.term === 'string' && item.term.trim()
            ? item.term.trim()
            : typeof item.title === 'string' && item.title.trim()
                ? item.title.trim()
                : '';
        const source = typeof item.source === 'string' && item.source.trim() ? item.source.trim() : '';
        const aliases = normalizeDefinitionAliases(item.aliases).filter(alias => alias !== title);
        if (!title || !source) {
            issues.push({
                severity: 'error',
                code: 'invalid-definition-entry',
                file: '.markdown-formal/definitions.json',
                line: index + 1,
                message: 'Definition entry requires non-empty term/title and source.'
            });
            return;
        }

        const parsedSource = parseSourceLocation(source);
        if (!parsedSource.sourceFilePath || parsedSource.sourceLine === undefined) {
            issues.push({
                severity: 'error',
                code: 'definition-source-invalid',
                file: '.markdown-formal/definitions.json',
                line: index + 1,
                message: `Definition source ${source} must use path.md:line format.`
            });
            return;
        }

        const documentContent = documentMap.get(parsedSource.sourceFilePath);
        if (documentContent === undefined) {
            issues.push({
                severity: 'error',
                code: 'definition-source-missing',
                file: '.markdown-formal/definitions.json',
                line: index + 1,
                message: `Definition source ${source} does not point to a known Markdown file.`
            });
            return;
        }

        const lines = documentContent.split(/\r\n|\r|\n/);
        if (parsedSource.sourceLine < 1 || parsedSource.sourceLine > lines.length) {
            issues.push({
                severity: 'error',
                code: 'definition-source-line-missing',
                file: '.markdown-formal/definitions.json',
                line: index + 1,
                message: `Definition source ${source} points outside the source file.`
            });
            return;
        }

        const extracted = sourceLineRangeContent(lines, parsedSource.sourceLine);
        const explicitContent = typeof item.content === 'string' && item.content.trim() ? item.content.trim() : '';
        if (!explicitContent) {
            issues.push({
                severity: 'warn',
                code: 'definition-content-missing',
                file: '.markdown-formal/definitions.json',
                line: index + 1,
                message: `Definition entry ${title} should include AI-maintained content; falling back to source extraction.`
            });
        } else if (!normalizeDefinitionContentForMatch(documentContent).includes(normalizeDefinitionContentForMatch(explicitContent))) {
            issues.push({
                severity: 'warn',
                code: 'definition-content-stale',
                file: '.markdown-formal/definitions.json',
                line: index + 1,
                message: `Definition entry ${title} content is not found in its source file near ${source}; update content after editing the source.`
            });
        }
        const content = explicitContent || extracted.content;
        const duplicateKey = `${title}:${parsedSource.sourceFilePath}:${parsedSource.sourceLine}`;
        const previousIndex = seen.get(duplicateKey);
        if (previousIndex !== undefined) {
            issues.push({
                severity: 'warn',
                code: 'duplicate-definition-entry',
                file: '.markdown-formal/definitions.json',
                line: index + 1,
                message: `Definition entry duplicates entry ${previousIndex + 1}.`
            });
        }
        seen.set(duplicateKey, index);

        const book = inferBookInfo(parsedSource.sourceFilePath, config);
        const volume = inferVolumeInfo(parsedSource.sourceFilePath, config);
        const label: LabelData = {
            type: 'def',
            title,
            filePath: parsedSource.sourceFilePath,
            bookKey: book.key,
            bookTitle: book.title,
            bookOrder: book.order,
            content,
            startLine: extracted.startLine,
            endLine: extracted.endLine
        };
        if (volume) {
            label.volumeKey = volume.key;
            label.volumeTitle = volume.title;
            label.volumeOrder = volume.order;
        }

        definitions.push({
            type: 'def',
            title,
            aliases,
            file: parsedSource.sourceFilePath,
            line: parsedSource.sourceLine,
            label
        });
    });

    return { definitions, issues };
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
    '公式': 'equation',
    '方程': 'equation',
    '图': 'figure',
    '图示': 'figure',
    '表': 'table',
    '表格': 'table',
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
    ex: 'example',
    equation: 'equation',
    eq: 'equation',
    formula: 'equation',
    figure: 'figure',
    fig: 'figure',
    table: 'table',
    tab: 'table'
};

function normalizeMarkerType(value: string): string | undefined {
    return MARKER_TYPE_ALIASES[value.toLowerCase()] || MARKER_TYPE_ALIASES[value];
}

function cleanMarkerTitle(title: string): string {
    const trimmed = title.trim();
    const strong = trimmed.match(/^(\*\*|__)\s*([\s\S]+?)\s*\1$/);
    return strong ? strong[2].trim() : trimmed;
}

function unwrapLeadingStrong(text: string): string | undefined {
    const strong = text.match(/^(\*\*|__)\s*([\s\S]+?)\s*\1(.*)$/);
    if (!strong) return undefined;
    return `${strong[2].trim()}${strong[3] || ''}`.trim();
}

function parseParenMarkerTitle(text: string, requireSeparator: boolean): string {
    const paren = text.match(/^[（(]([^）)]+)[）)]\s*([：:]?)/);
    if (!paren) return '';
    if (requireSeparator && !paren[2]) return '';
    return cleanMarkerTitle(paren[1]);
}

function extractMarkerTitle(type: string, rest: string): string {
    const trimmed = rest.trim();
    if (!trimmed) return '';

    const strongPrefix = unwrapLeadingStrong(trimmed);
    if (strongPrefix) {
        const strongTitle = parseParenMarkerTitle(strongPrefix, true);
        if (strongTitle) return strongTitle;
    }

    const parenTitle = parseParenMarkerTitle(trimmed, false);
    if (parenTitle) return parenTitle;

    if (type === 'def') {
        const term = trimmed.match(/^([^：:\n，,。.;；]+)[：:]/);
        if (term) return term[1].trim();
    }

    return '';
}

function normalizeLeadingMarkerEmphasis(text: string): string {
    const trimmed = text.trim();
    return unwrapLeadingStrong(trimmed) || trimmed;
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

    const text = normalizeLeadingMarkerEmphasis(line);
    const typePattern = '定理|引理|命题|推论|定义|注|例|公式|方程|图示|图|表格|表|Theorem|Thm\\.?|Lemma|Lem\\.?|Proposition|Prop\\.?|Corollary|Cor\\.?|Definition|Def\\.?|Remark|Rem\\.?|Example|Ex\\.?|Equation|Eq\\.?|Formula|Figure|Fig\\.?|Table|Tab\\.?';
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
        if (chapter === 0) return undefined;
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
    if (/^00[-_\s]?(?:intro|introduction)\.md$/i.test(basename)) return 'intro';
    if (/^intro\.md$/i.test(basename)) return 'intro';
    if (/^introduction\.md$/i.test(basename)) return 'intro';
    if (/^summary\.md$/i.test(basename)) return 'summary';
    return undefined;
}

function getMarkdownTitle(content: string, fallback: string): string {
    const headings: Array<{ level: number; title: string; formalMarker: boolean }> = [];
    let inFence = false;

    for (const line of String(content || '').split(/\r?\n/)) {
        if (/^\s*(```|~~~)/.test(line)) {
            inFence = !inFence;
            continue;
        }
        if (inFence) continue;

        const match = line.match(/^[ \t]{0,3}(#{1,6})[ \t]+(.+?)\s*$/);
        if (!match) continue;

        const title = match[2].replace(/[ \t]+#+[ \t]*$/, '').trim();
        if (!title) continue;

        headings.push({
            level: match[1].length,
            title,
            formalMarker: /^#[A-Za-z0-9_-]+\b/.test(title)
        });
    }

    if (headings.length === 0) return fallback;

    const topLevel = Math.min(...headings.map(heading => heading.level));
    const topHeadings = headings.filter(heading => heading.level === topLevel);
    if (topHeadings.length !== 1 || topHeadings[0].formalMarker) return fallback;
    return topHeadings[0].title;
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

function isDisplayMathLine(line: string): boolean {
    const text = line.trim();
    return text.startsWith('$$')
        || text.startsWith('\\[')
        || text.startsWith('\\]')
        || /^\\(?:begin|end)\{(?:equation|align|alignat|gather|multline|flalign|split|aligned|cases|matrix|pmatrix|bmatrix|vmatrix|Vmatrix)\*?\}/.test(text);
}

function isStructuredDefinitionContinuation(line: string): boolean {
    const text = line.trim();
    return isDisplayMathLine(line)
        || /^>\s*/.test(text)
        || /^\|.*\|$/.test(text)
        || /^[-+*]\s+/.test(text)
        || /^\d+[.)]\s+/.test(text)
        || /^(\*\*|__)?\s*[（(]?(?:[ivxlcdm]+|[a-z]|\d+)[）).、]\s*/i.test(text);
}

function isDisplayMathStartLine(line: string): boolean {
    const text = line.trim();
    return text.startsWith('$$')
        || text.startsWith('\\[')
        || /^\\begin\{(?:equation|align|alignat|gather|multline|flalign|split|aligned|cases|matrix|pmatrix|bmatrix|vmatrix|Vmatrix)\*?\}/.test(text);
}

function updateDisplayMathState(line: string, inDisplayMath: boolean): boolean {
    const text = line.trim();
    const dollarCount = (text.match(/\$\$/g) || []).length;
    if (dollarCount % 2 === 1) return !inDisplayMath;
    if (text.startsWith('\\[')) return true;
    if (text.startsWith('\\]')) return false;
    if (/^\\begin\{(?:equation|align|alignat|gather|multline|flalign|split|aligned|cases|matrix|pmatrix|bmatrix|vmatrix|Vmatrix)\*?\}/.test(text)) return true;
    if (/^\\end\{(?:equation|align|alignat|gather|multline|flalign|split|aligned|cases|matrix|pmatrix|bmatrix|vmatrix|Vmatrix)\*?\}/.test(text)) return false;
    return inDisplayMath;
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

function nextNonBlankLineIndex(lines: string[], startIndex: number): number {
    for (let i = startIndex; i < lines.length; i++) {
        if (lines[i].trim()) return i;
    }
    return -1;
}

function collectDefinitionContent(lines: string[], startLine: number, marker?: FormalMarker): { contentLines: string[]; endLine: number } {
    const contentLines = [marker ? markerLineContent(lines[startLine], marker) : lines[startLine].trim()];
    let endLine = startLine;
    let inDisplayMath = updateDisplayMathState(lines[startLine], false);
    let previousNonBlankWasDisplayMath = isDisplayMathLine(lines[startLine]);

    for (let i = startLine + 1; i < lines.length; i++) {
        const line = lines[i];
        if (isMarkerBoundaryLine(line)) break;

        if (!line.trim()) {
            const nextNonBlank = nextNonBlankLineIndex(lines, i + 1);
            if (nextNonBlank < 0 || isMarkerBoundaryLine(lines[nextNonBlank])) break;
            if (!inDisplayMath && !previousNonBlankWasDisplayMath && !isStructuredDefinitionContinuation(lines[nextNonBlank])) break;
            contentLines.push(line);
            endLine = i;
            previousNonBlankWasDisplayMath = false;
            continue;
        }

        const lineWasDisplayMath = inDisplayMath || isDisplayMathLine(line);
        contentLines.push(line);
        endLine = i;
        inDisplayMath = updateDisplayMathState(line, inDisplayMath);
        previousNonBlankWasDisplayMath = lineWasDisplayMath;
    }

    return { contentLines: trimTrailingBlankLines(contentLines), endLine };
}

function collectMarkerContent(lines: string[], startLine: number, marker: FormalMarker): { contentLines: string[]; endLine: number } {
    if (RECALL_TYPES.has(marker.type)) {
        return collectRecallMarkerContent(lines, startLine, marker);
    }

    if (marker.type === 'def') {
        return collectDefinitionContent(lines, startLine, marker);
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

function sourceLineRangeContent(lines: string[], sourceLine: number): { content: string; startLine: number; endLine: number } {
    const sourceIndex = Math.max(0, Math.min(lines.length - 1, sourceLine - 1));
    const marker = parseFormalMarkerLine(lines[sourceIndex]);
    if (marker) {
        const collected = collectMarkerContent(lines, sourceIndex, marker);
        return {
            content: collected.contentLines.join('\n'),
            startLine: sourceIndex,
            endLine: collected.endLine
        };
    }

    const isBoundary = (line: string) => !line.trim() || /^#{1,6}\s+/.test(line) || !!parseFormalMarkerLine(line);
    let startLine = sourceIndex;
    while (startLine > 0 && !isBoundary(lines[startLine - 1])) startLine--;

    const collected = collectDefinitionContent(lines, startLine);
    return {
        content: collected.contentLines.join('\n').trim(),
        startLine,
        endLine: collected.endLine
    };
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

function previousNonBlankLineIndex(lines: string[], startIndex: number): number {
    for (let i = startIndex; i >= 0; i--) {
        if (lines[i].trim()) return i;
    }
    return -1;
}

function isMarkdownImageLine(line: string): boolean {
    return /!\[[^\]\n]*\]\([^)]+\)/.test(line.trim());
}

function isMarkdownTableRow(line: string): boolean {
    const text = line.trim();
    return text.includes('|') && text.split('|').filter(part => part.trim()).length >= 2;
}

function isMarkdownTableDelimiter(line: string): boolean {
    const text = line.trim();
    if (!text.includes('|')) return false;
    const cells = text.replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
    return cells.length >= 2 && cells.every(cell => /^:?-{3,}:?$/.test(cell));
}

function isMarkdownTableStart(lines: string[], lineIndex: number): boolean {
    return lineIndex >= 0
        && lineIndex + 1 < lines.length
        && isMarkdownTableRow(lines[lineIndex])
        && isMarkdownTableDelimiter(lines[lineIndex + 1]);
}

function lintStructuredNumberedMarker(marker: FormalMarker, lines: string[], lineIndex: number, filePath: string): FormalIssue[] {
    if (!STRUCTURED_NUMBERED_TYPES.has(marker.type)) return [];

    const issues: FormalIssue[] = [];
    const next = nextNonBlankLineIndex(lines, lineIndex + 1);
    const previous = previousNonBlankLineIndex(lines, lineIndex - 1);

    if (marker.type === 'equation') {
        if (next < 0 || !isDisplayMathStartLine(lines[next])) {
            issues.push({
                severity: 'error',
                code: 'equation-target-missing',
                file: filePath,
                line: lineIndex + 1,
                message: 'Equation marker must be followed by a display math block.'
            });
        }
        return issues;
    }

    if (!marker.title) {
        issues.push({
            severity: 'warn',
            code: `${marker.type}-caption-missing`,
            file: filePath,
            line: lineIndex + 1,
            message: `${marker.type === 'figure' ? 'Figure' : 'Table'} marker should include a caption title.`
        });
    }

    if (marker.type === 'figure') {
        const hasNearbyImage = (previous >= 0 && isMarkdownImageLine(lines[previous]))
            || (next >= 0 && isMarkdownImageLine(lines[next]));
        if (!hasNearbyImage) {
            issues.push({
                severity: 'error',
                code: 'figure-target-missing',
                file: filePath,
                line: lineIndex + 1,
                message: 'Figure marker should be adjacent to a Markdown image.'
            });
        }
        return issues;
    }

    if (marker.type === 'table' && (next < 0 || !isMarkdownTableStart(lines, next))) {
        issues.push({
            severity: 'error',
            code: 'table-target-missing',
            file: filePath,
            line: lineIndex + 1,
            message: 'Table marker must be followed by a Markdown table.'
        });
    }

    return issues;
}

export function scanFormalDocuments(documents: FormalDocument[], configInput: any, symbolsInput?: unknown, definitionsInput?: unknown) {
    const config = mergeConfig(configInput);
    const files = [...documents].sort((a, b) => a.filePath.localeCompare(b.filePath));
    const labels: Record<string, LabelData> = {};
    const definitions: FormalDefinition[] = [];
    const references: FormalReference[] = [];
    const pageReferences: FormalPageReference[] = [];
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

        collectReferences(content, filePath, references, pageReferences);
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
        let equationCounter = 1;
        let figureCounter = 1;
        let tableCounter = 1;

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
                issues.push(...lintStructuredNumberedMarker(marker, lines, lineIndex, unitFile.filePath));

                let markerNumber: number | undefined;
                if (THEOREM_COUNTER_TYPES.has(marker.type)) {
                    markerNumber = itemCounter++;
                } else if (SECTION_TYPES.has(marker.type)) {
                    markerNumber = sectionCounter++;
                } else if (marker.type === 'remark') {
                    markerNumber = remarkCounter++;
                } else if (marker.type === 'example') {
                    markerNumber = exampleCounter++;
                } else if (marker.type === 'equation') {
                    markerNumber = equationCounter++;
                } else if (marker.type === 'figure') {
                    markerNumber = figureCounter++;
                } else if (marker.type === 'table') {
                    markerNumber = tableCounter++;
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

    const customDefinitionResult = parseFormalDefinitions(definitionsInput, files, config);
    for (const customDefinition of customDefinitionResult.definitions) {
        const existing = definitions.find(def => (
            def.type === 'def'
            && def.file === customDefinition.file
            && def.line === customDefinition.line
            && def.title === customDefinition.title
        ));
        if (existing) {
            existing.aliases = unique([...(existing.aliases || []), ...(customDefinition.aliases || [])]);
            continue;
        }
        definitions.push(customDefinition);
    }
    issues.push(...customDefinitionResult.issues);

    const symbolResult = parseFormalSymbols(symbolsInput, files);
    issues.push(...symbolResult.issues);
    issues.push(...lintDefinitions(definitions));
    issues.push(...lintReferences(references, labels, definitions, config));
    issues.push(...lintPageReferences(pageReferences, pages, config));
    issues.push(...lintPages(pages));

    definitions.sort(compareDefinitionRecords);
    pages.sort(comparePages);
    const dependencyGraph = buildDependencyGraph({ config, labels, definitions, references }, files);
    return { config, files: files.map(file => file.filePath), labels, pages, definitions, references, pageReferences, symbols: symbolResult.symbols, issues, dependencyGraph };
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

function collectReferences(content: string, filePath: string, references: FormalReference[], pageReferences: FormalPageReference[]): void {
    const stripped = stripIgnoredMarkdown(content);
    const lineStarts = [0];
    for (let i = 0; i < stripped.length; i++) {
        if (stripped[i] === '\n') lineStarts.push(i + 1);
    }

    const pageRefRe = /(^|[^A-Za-z0-9_])@(chapter|page):([^\s<>"'`，。；;！？]+?\.md)(?:\.(title|full))?(?=$|[\s,，。；;:：.!！?？)\]}])/g;
    let pageMatch;
    while ((pageMatch = pageRefRe.exec(stripped))) {
        const offset = pageMatch.index + pageMatch[1].length;
        const line = findLineForOffset(lineStarts, offset);
        pageReferences.push({
            kind: pageMatch[2] as 'chapter' | 'page',
            rawTarget: pageMatch[3],
            target: normalizeFormalPagePath(pageMatch[3], filePath),
            mode: pageMatch[4] as 'title' | 'full' | undefined,
            file: filePath,
            line
        });
    }

    const refRe = /(^|[^A-Za-z0-9_])@([A-Za-z0-9_-]+)(?:\.title)?\b(?!:)/g;
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

function normalizeBookDependencyKey(value: string): string {
    return String(value || '').trim().toLowerCase();
}

function directBookDependencies(config: any, sourceBookKey: string): string[] {
    const dependencies = config?.lookup?.bookDependencies;
    if (!dependencies || typeof dependencies !== 'object') return [];

    const source = normalizeBookDependencyKey(sourceBookKey);
    for (const [key, value] of Object.entries(dependencies)) {
        if (normalizeBookDependencyKey(key) !== source) continue;
        return Array.isArray(value)
            ? value.filter(item => typeof item === 'string').map(normalizeBookDependencyKey).filter(Boolean)
            : [];
    }
    return [];
}

function canReferenceBook(sourceBookKey: string, targetBookKey: string, config: any, seen = new Set<string>()): boolean {
    const source = normalizeBookDependencyKey(sourceBookKey);
    const target = normalizeBookDependencyKey(targetBookKey);
    if (!source || !target || source === target) return true;
    if (seen.has(source)) return false;
    seen.add(source);

    const dependencies = directBookDependencies(config, source);
    if (dependencies.includes(target)) return true;
    return dependencies.some(dependency => canReferenceBook(dependency, target, config, seen));
}

function lintReferences(references: FormalReference[], labels: Record<string, LabelData>, definitions: FormalDefinition[], config: any): FormalIssue[] {
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
            continue;
        }

        const target = labels[ref.id];
        const sourceBook = inferBookInfo(ref.file, config);
        const targetBookKey = target.bookKey || inferBookInfo(target.filePath || '', config).key;
        if (!canReferenceBook(sourceBook.key, targetBookKey, config)) {
            issues.push({
                severity: 'error',
                code: 'cross-book-ref-disallowed',
                file: ref.file,
                line: ref.line,
                message: `Reference @${ref.id} crosses from ${sourceBook.title} to ${target.bookTitle || targetBookKey}; add lookup.bookDependencies if this dependency is intentional.`
            });
        }
    }
    return issues;
}

function lintPageReferences(pageReferences: FormalPageReference[], pages: PageData[], config: any): FormalIssue[] {
    const issues: FormalIssue[] = [];
    const pageByPath = new Map(pages.map(page => [page.filePath, page]));

    for (const ref of pageReferences) {
        const target = pageByPath.get(ref.target);
        if (!target) {
            issues.push({
                severity: 'error',
                code: 'missing-page-ref',
                file: ref.file,
                line: ref.line,
                message: `Page reference @${ref.kind}:${ref.rawTarget} resolves to ${ref.target || '(empty)'}, but no scanned page matches that path.`
            });
            continue;
        }

        if (ref.kind === 'chapter' && target.kind !== 'chapter') {
            issues.push({
                severity: 'error',
                code: 'page-ref-kind-mismatch',
                file: ref.file,
                line: ref.line,
                message: `@chapter:${ref.rawTarget} points to a ${target.kind} page. Use @page:${target.filePath} for non-chapter pages.`
            });
        }

        const sourceBook = inferBookInfo(ref.file, config);
        const targetBookKey = target.bookKey || inferBookInfo(target.filePath || '', config).key;
        if (!canReferenceBook(sourceBook.key, targetBookKey, config)) {
            issues.push({
                severity: 'error',
                code: 'cross-book-page-ref-disallowed',
                file: ref.file,
                line: ref.line,
                message: `Page reference @${ref.kind}:${ref.rawTarget} crosses from ${sourceBook.title} to ${target.bookTitle || targetBookKey}; add lookup.bookDependencies if this dependency is intentional.`
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

export function formatDisplayNumber(label: LabelData): string {
    const number = formatLabelNumber(label);
    return label.type === 'equation' && number ? `(${number})` : number;
}

export function displayLabel(def: FormalDefinition, config: any): string {
    const name = typeName(config, def.type);
    if (def.type === 'section') {
        const number = formatLabelNumber(def.label);
        return number ? `${name} ${number}` : name;
    }

    const number = formatDisplayNumber(def.label);
    return number ? `${name} ${number}` : name;
}

export function displayNumber(def: FormalDefinition): string {
    return formatLabelNumber(def.label);
}

export function renderReferenceMap(definitions: FormalDefinition[], config: any, pages: PageData[] = []): string {
    const lines = [
        '# Reference Map',
        '',
        'Generated by `npm run formal -- prepare`. Read this file to map human display numbers to stable hash IDs.',
        ''
    ];

    if (pages.length > 0) {
        lines.push('## Pages', '');
        lines.push('| Display | Ref | Title | Location |');
        lines.push('| --- | --- | --- | --- |');
        for (const page of [...pages].sort(comparePages)) {
            const prefix = page.kind === 'chapter' ? 'chapter' : 'page';
            const ref = `@${prefix}:${page.filePath}`;
            lines.push(`| ${escapeTable(formatPageReference(page, config))} | \`${ref}\` | ${escapeTable(page.title || '')} | \`${page.filePath}\` |`);
        }
        lines.push('');
    }

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
            aliases: def.aliases && def.aliases.length > 0 ? def.aliases : undefined,
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

function buildDocumentMap(documents: FormalDocument[]): Map<string, string> {
    return new Map(documents.map(document => [toPosix(document.filePath), document.content || '']));
}

function findProofRange(lines: string[], startLine: number, statementEndLine: number): { proofStartLine?: number; proofEndLine?: number; endLine: number } {
    const startIndex = Math.max(0, startLine - 1);
    const statementEndIndex = Math.max(startIndex, statementEndLine - 1);
    let proofStartIndex = -1;

    for (let i = statementEndIndex + 1; i < lines.length; i++) {
        if (isMarkerBoundaryLine(lines[i])) break;
        if (isProofBoundaryLine(lines[i])) {
            proofStartIndex = i;
            break;
        }
    }

    if (proofStartIndex < 0) {
        return { endLine: statementEndLine };
    }

    let proofEndIndex = proofStartIndex;
    for (let i = proofStartIndex + 1; i < lines.length; i++) {
        if (isMarkerBoundaryLine(lines[i])) break;
        proofEndIndex = i;
    }

    return {
        proofStartLine: proofStartIndex + 1,
        proofEndLine: proofEndIndex + 1,
        endLine: proofEndIndex + 1
    };
}

function dependencySourceBlocks(definitions: FormalDefinition[], documents: FormalDocument[]): Map<string, DependencySourceBlock[]> {
    const documentMap = buildDocumentMap(documents);
    const blocksByFile = new Map<string, DependencySourceBlock[]>();

    for (const def of definitions) {
        if (!def.id || !THEOREM_COUNTER_TYPES.has(def.type)) continue;
        const content = documentMap.get(def.file);
        if (content === undefined) continue;
        const lines = content.split(/\r?\n/);
        const startLine = def.line;
        const labelEndLine = typeof def.label.endLine === 'number' ? def.label.endLine + 1 : startLine;
        const statementEndLine = Math.max(startLine, labelEndLine);
        const proofRange = findProofRange(lines, startLine, statementEndLine);
        const block: DependencySourceBlock = {
            id: def.id,
            file: def.file,
            startLine,
            statementEndLine,
            proofStartLine: proofRange.proofStartLine,
            proofEndLine: proofRange.proofEndLine,
            endLine: Math.max(statementEndLine, proofRange.endLine)
        };
        if (!blocksByFile.has(def.file)) blocksByFile.set(def.file, []);
        blocksByFile.get(def.file)!.push(block);
    }

    for (const blocks of blocksByFile.values()) {
        blocks.sort((a, b) => a.startLine - b.startLine);
    }
    return blocksByFile;
}

function findDependencySourceBlock(blocks: DependencySourceBlock[] | undefined, line: number): DependencySourceBlock | undefined {
    if (!blocks) return undefined;
    return blocks.find(block => block.startLine <= line && line <= block.endLine);
}

function dependencyEdgeWhere(block: DependencySourceBlock, line: number): DependencyEdgeWhere {
    if (line <= block.statementEndLine) return 'statement';
    if (block.proofStartLine !== undefined && block.proofEndLine !== undefined && block.proofStartLine <= line && line <= block.proofEndLine) {
        return 'proof';
    }
    return 'body';
}

function dependencyGraphNode(def: FormalDefinition, config: any): DependencyGraphNode {
    const label = def.label;
    const node: DependencyGraphNode = {
        id: def.id as string,
        kind: def.type,
        display: displayLabel(def, config),
        title: def.title || '',
        path: def.file,
        line: def.line,
        endLine: typeof label.endLine === 'number' ? label.endLine + 1 : undefined,
        bookKey: label.bookKey,
        bookTitle: label.bookTitle,
        bookOrder: label.bookOrder,
        volumeKey: label.volumeKey,
        volumeTitle: label.volumeTitle,
        volumeOrder: label.volumeOrder,
        unitKind: label.unitKind,
        unitKey: label.unitKey,
        unitLabel: label.unitLabel,
        unitOrder: label.unitOrder,
        chapter: label.chapter,
        appendix: label.appendix,
        number: label.number
    };

    Object.keys(node).forEach(key => {
        if ((node as any)[key] === undefined) delete (node as any)[key];
    });
    return node;
}

function dependencyGraphCycles(nodes: DependencyGraphNode[], edges: DependencyGraphEdge[]): DependencyGraphCycle[] {
    const nodeIds = new Set(nodes.map(node => node.id));
    const nodeById = new Map(nodes.map(node => [node.id, node]));
    const adjacency = new Map<string, Set<string>>();
    for (const node of nodes) adjacency.set(node.id, new Set());
    for (const edge of edges) {
        if (nodeIds.has(edge.from) && nodeIds.has(edge.to)) {
            adjacency.get(edge.from)!.add(edge.to);
        }
    }

    let index = 0;
    const indexes = new Map<string, number>();
    const lowlinks = new Map<string, number>();
    const stack: string[] = [];
    const onStack = new Set<string>();
    const cycles: DependencyGraphCycle[] = [];

    const strongConnect = (id: string) => {
        indexes.set(id, index);
        lowlinks.set(id, index);
        index++;
        stack.push(id);
        onStack.add(id);

        for (const next of adjacency.get(id) || []) {
            if (!indexes.has(next)) {
                strongConnect(next);
                lowlinks.set(id, Math.min(lowlinks.get(id) || 0, lowlinks.get(next) || 0));
            } else if (onStack.has(next)) {
                lowlinks.set(id, Math.min(lowlinks.get(id) || 0, indexes.get(next) || 0));
            }
        }

        if (lowlinks.get(id) !== indexes.get(id)) return;

        const component: string[] = [];
        while (stack.length > 0) {
            const item = stack.pop() as string;
            onStack.delete(item);
            component.push(item);
            if (item === id) break;
        }

        const hasSelfLoop = component.length === 1 && (adjacency.get(component[0]) || new Set()).has(component[0]);
        if (component.length > 1 || hasSelfLoop) {
            const ids = component.sort((a, b) => (nodeById.get(a)?.display || a).localeCompare(nodeById.get(b)?.display || b));
            cycles.push({
                ids,
                displays: ids.map(item => nodeById.get(item)?.display || item)
            });
        }
    };

    for (const node of nodes) {
        if (!indexes.has(node.id)) strongConnect(node.id);
    }

    return cycles.sort((a, b) => a.displays.join(' -> ').localeCompare(b.displays.join(' -> ')));
}

export function buildDependencyGraph(state: any, documents: FormalDocument[]): DependencyGraph {
    const config = state.config || mergeConfig(DEFAULT_CONFIG);
    const definitions: FormalDefinition[] = state.definitions || [];
    const references: FormalReference[] = state.references || [];
    const theoremDefinitions = definitions
        .filter(def => def.id && THEOREM_COUNTER_TYPES.has(def.type))
        .sort(compareDefinitionRecords);
    const nodeById = new Map(theoremDefinitions.map(def => [def.id as string, dependencyGraphNode(def, config)]));
    const blocksByFile = dependencySourceBlocks(theoremDefinitions, documents);
    const edges: DependencyGraphEdge[] = [];
    const diagnostics: DependencyGraphDiagnostic[] = [];

    for (const ref of references) {
        const target = nodeById.get(ref.id);
        const sourceBlock = findDependencySourceBlock(blocksByFile.get(ref.file), ref.line);
        if (!target) continue;
        if (!sourceBlock) {
            diagnostics.push({
                severity: 'info',
                code: 'ambient-theorem-ref',
                file: ref.file,
                line: ref.line,
                message: `Reference @${ref.id} targets a theorem-like object but is outside a theorem-like statement/proof block.`
            });
            continue;
        }

        edges.push({
            from: sourceBlock.id,
            to: ref.id,
            kind: 'explicit_ref',
            where: dependencyEdgeWhere(sourceBlock, ref.line),
            path: ref.file,
            line: ref.line
        });
    }

    const nodes = [...nodeById.values()].sort((a, b) => (
        (a.bookOrder || 0) - (b.bookOrder || 0)
        || (a.volumeOrder || 0) - (b.volumeOrder || 0)
        || (a.unitOrder || 0) - (b.unitOrder || 0)
        || a.path.localeCompare(b.path)
        || a.line - b.line
    ));
    const incoming = new Map(nodes.map(node => [node.id, 0]));
    const outgoing = new Map(nodes.map(node => [node.id, 0]));
    for (const edge of edges) {
        incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);
        outgoing.set(edge.from, (outgoing.get(edge.from) || 0) + 1);
    }

    const cycles = dependencyGraphCycles(nodes, edges);
    const isCrossBook = (edge: DependencyGraphEdge) => (nodeById.get(edge.from)?.bookKey || '') !== (nodeById.get(edge.to)?.bookKey || '');
    const isCrossVolume = (edge: DependencyGraphEdge) => (nodeById.get(edge.from)?.volumeKey || '') !== (nodeById.get(edge.to)?.volumeKey || '');
    const isCrossChapter = (edge: DependencyGraphEdge) => (nodeById.get(edge.from)?.unitKey || '') !== (nodeById.get(edge.to)?.unitKey || '');

    return {
        schemaVersion: 1,
        generatedBy: 'markdown-formal',
        nodes,
        edges,
        cycles,
        diagnostics,
        summary: {
            nodes: nodes.length,
            edges: edges.length,
            isolated: nodes.filter(node => (incoming.get(node.id) || 0) === 0 && (outgoing.get(node.id) || 0) === 0).length,
            cycles: cycles.length,
            crossBookEdges: edges.filter(isCrossBook).length,
            crossVolumeEdges: edges.filter(isCrossVolume).length,
            crossChapterEdges: edges.filter(isCrossChapter).length,
            statementEdges: edges.filter(edge => edge.where === 'statement').length,
            proofEdges: edges.filter(edge => edge.where === 'proof').length,
            bodyEdges: edges.filter(edge => edge.where === 'body').length
        }
    };
}

function dependencyNodeById(graph: DependencyGraph): Map<string, DependencyGraphNode> {
    return new Map(graph.nodes.map(node => [node.id, node]));
}

function dependencyDegreeRows(graph: DependencyGraph, direction: 'incoming' | 'outgoing', edges: DependencyGraphEdge[] = graph.edges): Array<{ node: DependencyGraphNode; count: number }> {
    const nodeById = dependencyNodeById(graph);
    const counts = new Map(graph.nodes.map(node => [node.id, 0]));
    for (const edge of edges) {
        const id = direction === 'incoming' ? edge.to : edge.from;
        counts.set(id, (counts.get(id) || 0) + 1);
    }
    return [...counts.entries()]
        .map(([id, count]) => ({ node: nodeById.get(id) as DependencyGraphNode, count }))
        .filter(row => row.node && row.count > 0)
        .sort((a, b) => b.count - a.count || a.node.display.localeCompare(b.node.display));
}

function dependencyNodeLocation(node: DependencyGraphNode): string {
    return `${node.path}:${node.line}`;
}

function dependencyNodeTitle(node: DependencyGraphNode): string {
    return `${node.display}${node.title ? ` ${node.title}` : ''}`;
}

function pushLimitedRows<T>(lines: string[], rows: T[], limit: number, render: (row: T) => string, moreRow?: (remaining: number) => string) {
    rows.slice(0, limit).forEach(row => lines.push(render(row)));
    if (rows.length > limit) {
        const remaining = rows.length - limit;
        lines.push(moreRow ? moreRow(remaining) : `| ... | ... | ${remaining} more |`);
    }
}

export function renderDependencyReport(graph: DependencyGraph): string {
    const nodeById = dependencyNodeById(graph);
    const lines = [
        '# Dependency Graph Report',
        '',
        'Generated by `npm run formal -- prepare`. The canonical data is `.markdown-formal/dependency-graph.json`.',
        '',
        '## Summary',
        '',
        `- Nodes: ${graph.summary.nodes}`,
        `- Explicit edges: ${graph.summary.edges}`,
        `- Statement edges: ${graph.summary.statementEdges}`,
        `- Proof edges: ${graph.summary.proofEdges}`,
        `- Body edges: ${graph.summary.bodyEdges}`,
        `- Cross-chapter edges: ${graph.summary.crossChapterEdges}`,
        `- Cross-volume edges: ${graph.summary.crossVolumeEdges}`,
        `- Cross-book edges: ${graph.summary.crossBookEdges}`,
        `- Isolated nodes: ${graph.summary.isolated}`,
        `- Cycles: ${graph.summary.cycles}`,
        ''
    ];

    const outgoing = dependencyDegreeRows(graph, 'outgoing');
    lines.push('## High Outgoing Dependencies', '');
    if (outgoing.length === 0) {
        lines.push('No outgoing dependencies.', '');
    } else {
        lines.push('| Count | Node | Location |');
        lines.push('| ---: | --- | --- |');
        pushLimitedRows(lines, outgoing, 20, row => `| ${row.count} | ${escapeTable(row.node.display)} ${escapeTable(row.node.title || '')} | \`${dependencyNodeLocation(row.node)}\` |`);
        lines.push('');
    }

    const incoming = dependencyDegreeRows(graph, 'incoming');
    lines.push('## High Incoming Dependencies', '');
    if (incoming.length === 0) {
        lines.push('No incoming dependencies.', '');
    } else {
        lines.push('| Count | Node | Location |');
        lines.push('| ---: | --- | --- |');
        pushLimitedRows(lines, incoming, 20, row => `| ${row.count} | ${escapeTable(row.node.display)} ${escapeTable(row.node.title || '')} | \`${dependencyNodeLocation(row.node)}\` |`);
        lines.push('');
    }

    const crossScopeEdges = graph.edges.filter(edge => {
        const from = nodeById.get(edge.from);
        const to = nodeById.get(edge.to);
        return from && to && ((from.bookKey || '') !== (to.bookKey || '') || (from.volumeKey || '') !== (to.volumeKey || '') || (from.unitKey || '') !== (to.unitKey || ''));
    });
    lines.push('## Cross-Scope Edges', '');
    if (crossScopeEdges.length === 0) {
        lines.push('No cross-scope theorem dependencies.', '');
    } else {
        lines.push('| Where | From | To | Reference |');
        lines.push('| --- | --- | --- | --- |');
        pushLimitedRows(lines, crossScopeEdges, 50, edge => {
            const from = nodeById.get(edge.from);
            const to = nodeById.get(edge.to);
            return `| ${edge.where} | ${escapeTable(from?.display || edge.from)} ${escapeTable(from?.title || '')} | ${escapeTable(to?.display || edge.to)} ${escapeTable(to?.title || '')} | \`${edge.path}:${edge.line}\` |`;
        });
        lines.push('');
    }

    lines.push('## Cycles', '');
    if (graph.cycles.length === 0) {
        lines.push('No theorem dependency cycles found.', '');
    } else {
        lines.push('| Cycle |');
        lines.push('| --- |');
        pushLimitedRows(lines, graph.cycles, 50, cycle => `| ${escapeTable(cycle.displays.join(' -> '))} |`, remaining => `| ... ${remaining} more |`);
        lines.push('');
    }

    const incomingCounts = new Map(graph.nodes.map(node => [node.id, 0]));
    const outgoingCounts = new Map(graph.nodes.map(node => [node.id, 0]));
    for (const edge of graph.edges) {
        incomingCounts.set(edge.to, (incomingCounts.get(edge.to) || 0) + 1);
        outgoingCounts.set(edge.from, (outgoingCounts.get(edge.from) || 0) + 1);
    }
    const isolated = graph.nodes.filter(node => (incomingCounts.get(node.id) || 0) === 0 && (outgoingCounts.get(node.id) || 0) === 0);
    lines.push('## Isolated Nodes', '');
    if (isolated.length === 0) {
        lines.push('No isolated theorem-like nodes.', '');
    } else {
        lines.push('| Node | Location |');
        lines.push('| --- | --- |');
        pushLimitedRows(lines, isolated, 100, node => `| ${escapeTable(node.display)} ${escapeTable(node.title || '')} | \`${dependencyNodeLocation(node)}\` |`);
        lines.push('');
    }

    if (graph.diagnostics.length > 0) {
        lines.push('## Diagnostics', '');
        lines.push('| Code | Location | Message |');
        lines.push('| --- | --- | --- |');
        pushLimitedRows(lines, graph.diagnostics, 100, diagnostic => {
            const location = diagnostic.file ? `${diagnostic.file}${diagnostic.line ? `:${diagnostic.line}` : ''}` : 'workspace';
            return `| ${diagnostic.code} | \`${location}\` | ${escapeTable(diagnostic.message)} |`;
        });
        lines.push('');
    }

    return `${lines.join('\n')}\n`;
}

function dependencyWhereMatches(edge: DependencyGraphEdge, where: DependencyGraphWhereFilter = 'all'): boolean {
    return where === 'all' || edge.where === where;
}

function filteredDependencyEdges(graph: DependencyGraph, where: DependencyGraphWhereFilter = 'all'): DependencyGraphEdge[] {
    return graph.edges.filter(edge => dependencyWhereMatches(edge, where));
}

function dependencyWhereSuffix(where: DependencyGraphWhereFilter = 'all'): string {
    return where === 'all' ? '' : ` (${where} edges only)`;
}

function dependencyFilteredSummary(graph: DependencyGraph, where: DependencyGraphWhereFilter = 'all') {
    const edges = filteredDependencyEdges(graph, where);
    const incoming = new Map(graph.nodes.map(node => [node.id, 0]));
    const outgoing = new Map(graph.nodes.map(node => [node.id, 0]));
    const nodeById = dependencyNodeById(graph);
    for (const edge of edges) {
        incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);
        outgoing.set(edge.from, (outgoing.get(edge.from) || 0) + 1);
    }

    const isCrossBook = (edge: DependencyGraphEdge) => (nodeById.get(edge.from)?.bookKey || '') !== (nodeById.get(edge.to)?.bookKey || '');
    const isCrossVolume = (edge: DependencyGraphEdge) => (nodeById.get(edge.from)?.volumeKey || '') !== (nodeById.get(edge.to)?.volumeKey || '');
    const isCrossChapter = (edge: DependencyGraphEdge) => (nodeById.get(edge.from)?.unitKey || '') !== (nodeById.get(edge.to)?.unitKey || '');
    const cycles = dependencyGraphCycles(graph.nodes, edges);

    return {
        edges,
        incoming,
        outgoing,
        cycles,
        isolated: graph.nodes.filter(node => (incoming.get(node.id) || 0) === 0 && (outgoing.get(node.id) || 0) === 0),
        crossBookEdges: edges.filter(isCrossBook).length,
        crossVolumeEdges: edges.filter(isCrossVolume).length,
        crossChapterEdges: edges.filter(isCrossChapter).length,
        statementEdges: edges.filter(edge => edge.where === 'statement').length,
        proofEdges: edges.filter(edge => edge.where === 'proof').length,
        bodyEdges: edges.filter(edge => edge.where === 'body').length
    };
}

function pushDependencyEdgeTable(lines: string[], graph: DependencyGraph, edges: DependencyGraphEdge[], limit = 100) {
    const nodeById = dependencyNodeById(graph);
    if (edges.length === 0) {
        lines.push('No dependency edges.', '');
        return;
    }

    lines.push('| Where | From | To | Reference |');
    lines.push('| --- | --- | --- | --- |');
    const sorted = [...edges].sort((a, b) => (
        a.path.localeCompare(b.path)
        || a.line - b.line
        || (nodeById.get(a.from)?.display || a.from).localeCompare(nodeById.get(b.from)?.display || b.from)
        || (nodeById.get(a.to)?.display || a.to).localeCompare(nodeById.get(b.to)?.display || b.to)
    ));
    pushLimitedRows(lines, sorted, limit, edge => {
        const from = nodeById.get(edge.from);
        const to = nodeById.get(edge.to);
        return `| ${edge.where} | ${escapeTable(from ? dependencyNodeTitle(from) : edge.from)} | ${escapeTable(to ? dependencyNodeTitle(to) : edge.to)} | \`${edge.path}:${edge.line}\` |`;
    });
    lines.push('');
}

export function renderDependencyGraphSummary(graph: DependencyGraph, where: DependencyGraphWhereFilter = 'all'): string {
    const summary = dependencyFilteredSummary(graph, where);
    const lines = [
        `# Dependency Graph Summary${dependencyWhereSuffix(where)}`,
        '',
        `- Nodes: ${graph.nodes.length}`,
        `- Explicit edges: ${summary.edges.length}`,
        `- Statement edges: ${summary.statementEdges}`,
        `- Proof edges: ${summary.proofEdges}`,
        `- Body edges: ${summary.bodyEdges}`,
        `- Cross-chapter edges: ${summary.crossChapterEdges}`,
        `- Cross-volume edges: ${summary.crossVolumeEdges}`,
        `- Cross-book edges: ${summary.crossBookEdges}`,
        `- Isolated nodes: ${summary.isolated.length}`,
        `- Cycles: ${summary.cycles.length}`,
        ''
    ];

    const outgoing = dependencyDegreeRows(graph, 'outgoing', summary.edges);
    lines.push('## Top Outgoing', '');
    if (outgoing.length === 0) {
        lines.push('No outgoing dependencies.', '');
    } else {
        lines.push('| Count | Node | Location |');
        lines.push('| ---: | --- | --- |');
        pushLimitedRows(lines, outgoing, 10, row => `| ${row.count} | ${escapeTable(dependencyNodeTitle(row.node))} | \`${dependencyNodeLocation(row.node)}\` |`);
        lines.push('');
    }

    const incoming = dependencyDegreeRows(graph, 'incoming', summary.edges);
    lines.push('## Top Incoming', '');
    if (incoming.length === 0) {
        lines.push('No incoming dependencies.', '');
    } else {
        lines.push('| Count | Node | Location |');
        lines.push('| ---: | --- | --- |');
        pushLimitedRows(lines, incoming, 10, row => `| ${row.count} | ${escapeTable(dependencyNodeTitle(row.node))} | \`${dependencyNodeLocation(row.node)}\` |`);
        lines.push('');
    }

    return `${lines.join('\n')}\n`;
}

function dependencyReachable(graph: DependencyGraph, rootId: string, direction: 'upstream' | 'impact', where: DependencyGraphWhereFilter = 'all', maxDepth = Number.POSITIVE_INFINITY): Array<{ node: DependencyGraphNode; depth: number }> {
    const nodeById = dependencyNodeById(graph);
    if (!nodeById.has(rootId)) return [];

    const adjacency = new Map<string, Set<string>>();
    for (const node of graph.nodes) adjacency.set(node.id, new Set());
    for (const edge of filteredDependencyEdges(graph, where)) {
        if (direction === 'upstream') {
            adjacency.get(edge.from)?.add(edge.to);
        } else {
            adjacency.get(edge.to)?.add(edge.from);
        }
    }

    const visited = new Map<string, number>([[rootId, 0]]);
    const queue = [rootId];
    for (let index = 0; index < queue.length; index++) {
        const current = queue[index];
        const currentDepth = visited.get(current) || 0;
        if (currentDepth >= maxDepth) continue;
        for (const next of adjacency.get(current) || []) {
            if (visited.has(next)) continue;
            visited.set(next, currentDepth + 1);
            queue.push(next);
        }
    }

    return [...visited.entries()]
        .filter(([id]) => id !== rootId)
        .map(([id, depth]) => ({ node: nodeById.get(id) as DependencyGraphNode, depth }))
        .filter(row => row.node)
        .sort((a, b) => a.depth - b.depth || dependencyNodeLocation(a.node).localeCompare(dependencyNodeLocation(b.node)));
}

function renderDependencyNodeHeader(title: string, graph: DependencyGraph, id: string, where: DependencyGraphWhereFilter): string[] {
    const node = dependencyNodeById(graph).get(id);
    const lines = [`# ${title}${dependencyWhereSuffix(where)}`, ''];
    if (!node) {
        lines.push(`Node \`${id}\` was not found in dependency graph.`, '');
        return lines;
    }
    lines.push(`- Node: ${dependencyNodeTitle(node)}`);
    lines.push(`- ID: \`${node.id}\``);
    lines.push(`- Location: \`${dependencyNodeLocation(node)}\``);
    lines.push('');
    return lines;
}

function pushDependencyNodeRows(lines: string[], rows: Array<{ node: DependencyGraphNode; depth: number }>) {
    if (rows.length === 0) {
        lines.push('No nodes.', '');
        return;
    }
    lines.push('| Depth | Node | Location |');
    lines.push('| ---: | --- | --- |');
    pushLimitedRows(lines, rows, 200, row => `| ${row.depth} | ${escapeTable(dependencyNodeTitle(row.node))} | \`${dependencyNodeLocation(row.node)}\` |`);
    lines.push('');
}

export function renderDependencyGraphImpact(graph: DependencyGraph, id: string, where: DependencyGraphWhereFilter = 'all'): string {
    const lines = renderDependencyNodeHeader('Dependency Impact Closure', graph, id, where);
    if (!dependencyNodeById(graph).has(id)) return `${lines.join('\n')}\n`;
    const rows = dependencyReachable(graph, id, 'impact', where);
    lines.push(`Downstream impacted nodes: ${rows.length}`, '');
    pushDependencyNodeRows(lines, rows);
    return `${lines.join('\n')}\n`;
}

export function renderDependencyGraphUpstream(graph: DependencyGraph, id: string, where: DependencyGraphWhereFilter = 'all'): string {
    const lines = renderDependencyNodeHeader('Dependency Upstream Closure', graph, id, where);
    if (!dependencyNodeById(graph).has(id)) return `${lines.join('\n')}\n`;
    const rows = dependencyReachable(graph, id, 'upstream', where);
    lines.push(`Upstream dependency nodes: ${rows.length}`, '');
    pushDependencyNodeRows(lines, rows);
    return `${lines.join('\n')}\n`;
}

export function renderDependencyGraphFocus(graph: DependencyGraph, id: string, depth = 2, where: DependencyGraphWhereFilter = 'all'): string {
    const safeDepth = Math.max(1, Math.floor(depth || 2));
    const lines = renderDependencyNodeHeader(`Dependency Focus Depth ${safeDepth}`, graph, id, where);
    if (!dependencyNodeById(graph).has(id)) return `${lines.join('\n')}\n`;

    const upstream = dependencyReachable(graph, id, 'upstream', where, safeDepth);
    const impact = dependencyReachable(graph, id, 'impact', where, safeDepth);
    lines.push('## Upstream', '');
    pushDependencyNodeRows(lines, upstream);
    lines.push('## Downstream Impact', '');
    pushDependencyNodeRows(lines, impact);

    const focusIds = new Set([id, ...upstream.map(row => row.node.id), ...impact.map(row => row.node.id)]);
    const focusEdges = filteredDependencyEdges(graph, where).filter(edge => focusIds.has(edge.from) && focusIds.has(edge.to));
    lines.push('## Local Edges', '');
    pushDependencyEdgeTable(lines, graph, focusEdges, 200);
    return `${lines.join('\n')}\n`;
}

export function renderDependencyGraphIsolated(graph: DependencyGraph, where: DependencyGraphWhereFilter = 'all'): string {
    const summary = dependencyFilteredSummary(graph, where);
    const lines = [`# Isolated Theorem-Like Nodes${dependencyWhereSuffix(where)}`, '', `Isolated nodes: ${summary.isolated.length}`, ''];
    if (summary.isolated.length === 0) {
        lines.push('No isolated theorem-like nodes.', '');
        return `${lines.join('\n')}\n`;
    }
    lines.push('| Node | Location |');
    lines.push('| --- | --- |');
    pushLimitedRows(lines, summary.isolated, 500, node => `| ${escapeTable(dependencyNodeTitle(node))} | \`${dependencyNodeLocation(node)}\` |`);
    lines.push('');
    return `${lines.join('\n')}\n`;
}

export function renderDependencyGraphCycles(graph: DependencyGraph, where: DependencyGraphWhereFilter = 'all'): string {
    const cycles = dependencyGraphCycles(graph.nodes, filteredDependencyEdges(graph, where));
    const lines = [`# Dependency Cycles${dependencyWhereSuffix(where)}`, '', `Cycles: ${cycles.length}`, ''];
    if (cycles.length === 0) {
        lines.push('No theorem dependency cycles found.', '');
        return `${lines.join('\n')}\n`;
    }
    lines.push('| Cycle | IDs |');
    lines.push('| --- | --- |');
    pushLimitedRows(lines, cycles, 200, cycle => `| ${escapeTable(cycle.displays.join(' -> '))} | \`${cycle.ids.join(' -> ')}\` |`);
    lines.push('');
    return `${lines.join('\n')}\n`;
}

function dependencyScopeLabel(node: DependencyGraphNode, scope: DependencyGraphMatrixScope): string {
    const book = node.bookTitle || node.bookKey || 'Workspace';
    if (scope === 'book') return book;

    const volume = node.volumeTitle || node.volumeKey || 'No volume';
    if (scope === 'volume') return `${book} / ${volume}`;

    const unit = node.unitKind === 'appendix'
        ? `Appendix ${node.unitLabel || node.appendix || '?'}`
        : node.unitLabel
            ? `Chapter ${node.unitLabel}`
            : node.unitKey || node.path;
    return `${book} / ${volume} / ${unit}`;
}

export function renderDependencyGraphMatrix(graph: DependencyGraph, scope: DependencyGraphMatrixScope, where: DependencyGraphWhereFilter = 'all'): string {
    const nodeById = dependencyNodeById(graph);
    const edges = filteredDependencyEdges(graph, where);
    const rowTotals = new Map<string, number>();
    const columnTotals = new Map<string, number>();
    const counts = new Map<string, number>();

    for (const edge of edges) {
        const from = nodeById.get(edge.from);
        const to = nodeById.get(edge.to);
        if (!from || !to) continue;
        const row = dependencyScopeLabel(from, scope);
        const column = dependencyScopeLabel(to, scope);
        rowTotals.set(row, (rowTotals.get(row) || 0) + 1);
        columnTotals.set(column, (columnTotals.get(column) || 0) + 1);
        counts.set(`${row}\t${column}`, (counts.get(`${row}\t${column}`) || 0) + 1);
    }

    const rows = [...rowTotals.keys()].sort((a, b) => a.localeCompare(b));
    const columns = [...columnTotals.keys()].sort((a, b) => a.localeCompare(b));
    const lines = [`# Dependency Matrix By ${scope}${dependencyWhereSuffix(where)}`, '', `Edges: ${edges.length}`, ''];
    if (rows.length === 0 || columns.length === 0) {
        lines.push('No dependency edges.', '');
        return `${lines.join('\n')}\n`;
    }

    lines.push(`| From \u2192 To | ${columns.map(escapeTable).join(' | ')} | Total |`);
    lines.push(`| --- | ${columns.map(() => '---:').join(' | ')} | ---: |`);
    for (const row of rows) {
        const values = columns.map(column => counts.get(`${row}\t${column}`) || 0);
        const total = values.reduce((sum, value) => sum + value, 0);
        lines.push(`| ${escapeTable(row)} | ${values.join(' | ')} | ${total} |`);
    }
    lines.push(`| Total | ${columns.map(column => columnTotals.get(column) || 0).join(' | ')} | ${edges.length} |`);
    lines.push('');
    return `${lines.join('\n')}\n`;
}

export function renderDependencyGraphBridges(graph: DependencyGraph, where: DependencyGraphWhereFilter = 'all'): string {
    const edges = filteredDependencyEdges(graph, where);
    const nodeById = dependencyNodeById(graph);
    const incoming = new Map(graph.nodes.map(node => [node.id, 0]));
    const outgoing = new Map(graph.nodes.map(node => [node.id, 0]));
    const crossScope = new Map(graph.nodes.map(node => [node.id, 0]));

    for (const edge of edges) {
        const from = nodeById.get(edge.from);
        const to = nodeById.get(edge.to);
        incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);
        outgoing.set(edge.from, (outgoing.get(edge.from) || 0) + 1);
        if (from && to && ((from.bookKey || '') !== (to.bookKey || '') || (from.volumeKey || '') !== (to.volumeKey || '') || (from.unitKey || '') !== (to.unitKey || ''))) {
            crossScope.set(edge.from, (crossScope.get(edge.from) || 0) + 1);
            crossScope.set(edge.to, (crossScope.get(edge.to) || 0) + 1);
        }
    }

    const rows = graph.nodes
        .map(node => ({
            node,
            incoming: incoming.get(node.id) || 0,
            outgoing: outgoing.get(node.id) || 0,
            crossScope: crossScope.get(node.id) || 0
        }))
        .filter(row => row.incoming > 0 && row.outgoing > 0)
        .sort((a, b) => b.crossScope - a.crossScope || (b.incoming + b.outgoing) - (a.incoming + a.outgoing) || dependencyNodeTitle(a.node).localeCompare(dependencyNodeTitle(b.node)));

    const lines = [`# Bridge Candidates${dependencyWhereSuffix(where)}`, '', 'A bridge candidate is a theorem-like node with both incoming and outgoing explicit dependencies. This is structural only, not a domain judgment.', '', `Candidates: ${rows.length}`, ''];
    if (rows.length === 0) {
        lines.push('No bridge candidates.', '');
        return `${lines.join('\n')}\n`;
    }
    lines.push('| Cross-scope | Incoming | Outgoing | Node | Location |');
    lines.push('| ---: | ---: | ---: | --- | --- |');
    pushLimitedRows(lines, rows, 200, row => `| ${row.crossScope} | ${row.incoming} | ${row.outgoing} | ${escapeTable(dependencyNodeTitle(row.node))} | \`${dependencyNodeLocation(row.node)}\` |`);
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
        `Current cache: ${Object.keys(state.labels).length} preview entries, ${state.pages.length} pages, ${(state.symbols || []).length} symbols, ${errors} errors, ${warnings} warnings.`,
        '',
        '## Normal Writing',
        '',
        '1. Read the target Markdown file.',
        '2. Read `.markdown-formal/reference-map.md` to map display numbers to stable hash IDs and page paths.',
        '3. Put stable IDs directly where numbers used to appear: `## #tmp-1 Section`, `定理 #tmp-2（Title）：...`, `公式 #tmp-3：`, `图 #tmp-4（Caption）：...`, or `表 #tmp-5（Caption）：`. Definitions are not numbered objects and never get hash IDs or refs.',
        '4. Reference numbered objects with `@h-...`; reference chapters with `@chapter:path/to/file.md`; never handwrite display numbers as references. `#h-...` / `#tmp-*` is declaration syntax only; do not write `命题 #h-...` or `Theorem #h-...` in prose references.',
        '5. Keep Markdown and LaTeX unescaped.',
        '6. Run `npm run formal -- finish <file-or-dir>` after editing; it finalizes temporary IDs and verifies the workspace.',
        '7. Run `npm run formal -- audit <file-or-dir>` when you want an advisory cleanup list for old prose refs, bare number candidates, optional blocks, and proof-boundary hints.',
        '8. Before changing an existing theorem-like block, run `npm run formal -- graph impact <h-id>` or `npm run formal -- graph focus <h-id> --depth 2` when downstream dependencies matter.',
        '9. If you use `finalize` directly, also run `npm run formal -- verify` before treating generated or migrated content as complete.',
        '',
        '## Lightweight Syntax',
        '',
        '- Sections: `## #h-... Title` renders as the current section number plus title, and links jump to the section without hover recall.',
        '- Numbered objects: `命题 #h-...（Title）：...`, `引理 #h-...`, `定理 #h-...`, `推论 #h-...` share the theorem counter per chapter or appendix.',
        '- Equations, figures, and tables: `公式 #h-...：` binds the next display formula as a numbered equation, `图 #h-...（Title）：...` captions a nearby image, and `表 #h-...（Title）：` captions the following table. They have separate counters per chapter or appendix; equations render as `(1.1)`, appendices as `(A.1)`.',
        '- Chapter/page refs: use `@chapter:book1/02-main.md`, `@chapter:book1/02-main.md.title`, or `@chapter:book1/02-main.md.full`; paths are relative to the formal root that owns `.markdown-formal/`. `@page:path.md` is for intro, summary, and appendix pages. `finish` normalizes `./` and `../` input sugar to root-relative paths.',
        '- Theorem-like recall captures the statement before `证明` / `Proof`; keep proofs after an explicit proof marker.',
        '- Dependency graph: `.markdown-formal/dependency-graph.json` is the canonical explicit theorem-like dependency graph. It uses only `@h-...` references between propositions/lemmas/theorems/corollaries and marks edges as `statement`, `proof`, or `body`; `.markdown-formal/dependency-report.md` is the review view. Use `npm run formal -- graph summary`, `graph impact <h-id>`, `graph upstream <h-id>`, `graph focus <h-id> --depth 2`, `graph bridges`, `graph isolated`, `graph cycles`, or `graph matrix chapter|volume|book` for Markdown analysis. Add `--where statement|proof|body` to filter edge placement. These are structural graph tools, not domain interpretation.',
        '- Definitions: lookup is a tool-first, AI-exception workflow. The tool scans standard `定义（Term）：...` / `Definition (Term): ...` definitions with structural range heuristics. When editing a file, AI only updates `.markdown-formal/definitions.json` for nonstandard phrases, aliases/bilingual lookup, stable multi-paragraph previews, or boundaries the heuristic may get wrong; include Markdown `content` for those entries.',
        '- Remarks/examples stay plain by default. Only when later text already cites one, convert that exact item to `注 #tmp-*` / `例 #tmp-*` and run `finish`.',
        '- Symbols: maintain only project-specific `source`, `pattern`, and `meaning` entries in `.markdown-formal/symbols.json`; patterns describe the notation itself with balanced delimiters, not whole equations or open-ended formula fragments. The navigation symbol table lists symbols matched in the current preview file. Symbols are not inline formula refs and are not searched through the definition search box.',
        '- Appendices use the appendix file prefix, so markers in `appendix-a-*.md` render as `A.1`, `A.2`, etc. `00-introduction.md`, `intro.md`, and `introduction.md` are intro pages, not chapter 0.',
        '',
        '## Generated Files',
        '',
        '- `.markdown-formal/reference-map.md`: compact display-number to hash-ID table.',
        '- `.markdown-formal/preview-cache.json`: runtime preview/navigation/definition/symbol table cache.',
        '- `.markdown-formal/dependency-graph.json`: canonical theorem-like dependency graph from explicit `@h-...` references.',
        '- `.markdown-formal/dependency-report.md`: human/AI dependency graph review report.',
        '- `.markdown-formal/report.md`: lint/verify details.',
        '- `.markdown-formal/audit.md`: advisory AI cleanup list generated by `audit`.',
        '- `.markdown-formal/text-ref-migration.md`: generated only after text-reference migration.',
        '- `.markdown-formal/definitions.json` / `.markdown-formal/symbols.json`: optional AI-maintained source tables for definition lookup exceptions and project-specific notation.',
        '- `.markdown-formal/config.json`: explicit opt-in switch for enhanced Markdown preview. Without this config or generated `preview-cache.json`, the extension leaves previews as ordinary Markdown and does not inject navigation/search/formal reference data. Use `scan.exclude` when project-root scans must ignore build, draft, context, or generated Markdown directories; use `preview.ignoreHover` for concept appendices or recall-heavy files that should keep numbering/navigation but skip inline `@hash` hover previews. `ignoreHover` accepts full relative paths, bare filenames, and globs. Temporarily set `debug.previewLog` to write `.markdown-formal/preview-debug.log` when diagnosing blank previews.',
        '',
        '## Migration',
        '',
        '- Use `npm run formal -- migrate-text-refs <file-or-dir>` before applying old numbered prose migration; migration commands are dry-run by default.',
        '- `migrate-text-refs` rewrites typed old references such as `定理 2.1`, `命题2.2`, `Theorem 2.1`, `公式 (2.1)`, `Figure 2.1`, `表 2.1`, `§2.1`, or `第 2.1 节`. It intentionally does not rewrite bare `2.1`, bare `(2.1)`, or handwritten chapter refs such as `第 2 章`; decide those by reading context and convert chapter refs to `@chapter:path.md`. Matching is bounded so `2.1` is not replaced inside `2.12`, `2.1.3`, or `22.1`.',
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
