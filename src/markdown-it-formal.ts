import * as fs from 'fs';
import * as path from 'path';
import {
    DEFAULT_CONFIG,
    getLanguage,
    mergeConfig,
    parseFormalMarkerLine,
    shouldIgnorePreviewHover,
    type RuntimeDefinitionData,
    type RuntimeSymbolData
} from './core/formal-core';
import { appendPreviewDebugLog } from './core/debug-log';

interface LabelData {
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

interface PageData {
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

interface FormulaData {
    latex: string;
    display: boolean;
}

interface TooltipRenderStats {
    refCount: number;
    referencedIdCount: number;
    contentChars: number;
}

function uniqueValues(values: string[]): string[] {
    return Array.from(new Set(values.filter(Boolean)));
}

function stripUndefinedFields<T extends Record<string, any>>(value: T): T {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function elapsedMs(startedAt: number): number {
    return Date.now() - startedAt;
}

function objectChars(value: unknown): number {
    return JSON.stringify(value ?? null).length;
}

function getDictionary(config: any): Record<string, string> {
    const language = getLanguage(config);
    return {
        ...DEFAULT_CONFIG.dictionary[language],
        ...(config?.dictionary?.[language] || {})
    };
}

function getColon(config: any): string {
    return getLanguage(config) === 'en' ? ': ' : '：';
}

function escapeHtml(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizeFileHref(rootPath: string, filePath: string, id: string): string {
    if (!filePath) return `#formal-${encodeURIComponent(id)}`;
    // In VS Code markdown preview, absolute paths starting with '/' are resolved relative to the workspace root.
    return `/${encodeURI(filePath)}#formal-${encodeURIComponent(id)}`;
}

function normalizePreviewFilePath(filePath: string): string {
    return String(filePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function definitionTargetId(index: number): string {
    return `formal-def-${index}`;
}

function referencedFormalIds(src: string): string[] {
    return uniqueValues(Array.from(src.matchAll(/@([a-zA-Z0-9_-]+)(?:\.title)?/g), match => match[1]));
}

function countFormalRefs(src: string): number {
    return Array.from(src.matchAll(/@([a-zA-Z0-9_-]+)(?:\.title)?/g)).length;
}

function tooltipRenderStats(src: string, labels: Record<string, LabelData>): TooltipRenderStats {
    const refCount = countFormalRefs(src);
    const contentChars = referencedFormalIds(src).reduce((sum, id) => {
        const label = labels[id];
        if (!label || label.type === 'section') return sum;
        return sum + String(label.content || '').length;
    }, 0);
    return {
        refCount,
        referencedIdCount: referencedFormalIds(src).length,
        contentChars
    };
}

function shouldEagerRenderTooltips(filePath: string, config: any): boolean {
    return !shouldIgnorePreviewHover(filePath, config);
}

function addClass(attrs: string, className: string): string {
    if (/\sclass\s*=/.test(attrs)) {
        return attrs.replace(/\sclass=(["'])(.*?)\1/i, (_match, quote, existing) => ` class=${quote}${existing} ${className}${quote}`);
    }
    
    return `${attrs} class="${className}"`;
}

function inlineSafeRenderedMarkdown(html: string): string {
    return html
        .replace(/<script\b[\s\S]*?<\/script>/gi, '')
        .replace(/<p\b([^>]*)>/gi, (_match, attrs) => `<span${addClass(attrs, 'formal-tooltip-block formal-tooltip-p')}>`)
        .replace(/<\/p>/gi, '</span>')
        .replace(/<div\b([^>]*)>/gi, (_match, attrs) => `<span${addClass(attrs, 'formal-tooltip-block')}>`)
        .replace(/<\/div>/gi, '</span>')
        .replace(/<ul\b([^>]*)>/gi, (_match, attrs) => `<span${addClass(attrs, 'formal-tooltip-block formal-tooltip-list')}>`)
        .replace(/<\/ul>/gi, '</span>')
        .replace(/<ol\b([^>]*)>/gi, (_match, attrs) => `<span${addClass(attrs, 'formal-tooltip-block formal-tooltip-list')}>`)
        .replace(/<\/ol>/gi, '</span>')
        .replace(/<li\b([^>]*)>/gi, (_match, attrs) => `<span${addClass(attrs, 'formal-tooltip-list-item')}>`)
        .replace(/<\/li>/gi, '</span>')
        .replace(/<blockquote\b([^>]*)>/gi, (_match, attrs) => `<span${addClass(attrs, 'formal-tooltip-block formal-tooltip-quote')}>`)
        .replace(/<\/blockquote>/gi, '</span>')
        .replace(/<pre\b([^>]*)>/gi, (_match, attrs) => `<span${addClass(attrs, 'formal-tooltip-block formal-tooltip-pre')}>`)
        .replace(/<\/pre>/gi, '</span>')
        .replace(/<h([1-6])\b([^>]*)>/gi, (_match, level, attrs) => `<span${addClass(attrs, `formal-tooltip-block formal-tooltip-heading formal-tooltip-heading-${level}`)}>`)
        .replace(/<\/h[1-6]>/gi, '</span>');
}

function getNumberPrefix(labelData: LabelData): string {
    if (labelData.unitLabel) return labelData.unitLabel;
    if (labelData.chapter !== undefined) return String(labelData.chapter);
    if (labelData.appendix) return labelData.appendix;
    return '';
}

function formatLabelNumber(labelData: LabelData): string {
    const prefix = getNumberPrefix(labelData);
    return prefix && labelData.number !== undefined ? `${prefix}.${labelData.number}` : '';
}

function setAttr(token: any, name: string, value: string) {
    token.attrs = token.attrs || [];
    const index = token.attrs.findIndex((attr: any) => attr[0] === name);
    if (index >= 0) token.attrs[index][1] = value;
    else token.attrs.push([name, value]);
}

function addTokenClass(token: any, className: string) {
    token.attrs = token.attrs || [];
    const index = token.attrs.findIndex((attr: any) => attr[0] === 'class');
    if (index >= 0) {
        const classes = new Set(String(token.attrs[index][1]).split(/\s+/).filter(Boolean));
        className.split(/\s+/).filter(Boolean).forEach(item => classes.add(item));
        token.attrs[index][1] = Array.from(classes).join(' ');
    } else {
        token.attrs.push(['class', className]);
    }
}

function replaceFirstTextChild(inlineToken: any, from: string, to: string) {
    inlineToken.content = String(inlineToken.content || '').replace(from, to);
    if (!inlineToken.children) return;
    for (const child of inlineToken.children) {
        if (child.type !== 'text') continue;
        const next = String(child.content || '').replace(from, to);
        if (next !== child.content) {
            child.content = next;
            return;
        }
    }
}

function markerTypeName(config: any, type: string): string {
    const dict = getDictionary(config);
    return dict[type] || type;
}

function renderedMarkerPrefix(marker: any, labelData: LabelData, config: any): string {
    if (marker.type === 'section') {
        return formatLabelNumber(labelData);
    }

    const typeName = markerTypeName(config, labelData.type || marker.type);
    const number = formatLabelNumber(labelData);
    const space = /^[A-Za-z]/.test(typeName) ? ' ' : '';
    return number ? `${typeName}${space}${number}` : typeName;
}

function findDefinitionIndex(definitions: RuntimeDefinitionData[], currentFilePath: string, lineNumber: number | undefined, title: string): number {
    if (lineNumber === undefined) return -1;

    const normalizedCurrent = normalizePreviewFilePath(currentFilePath);
    const matches = definitions
        .map((def, index) => ({ def, index }))
        .filter(item => (
            item.def.line === lineNumber
            && item.def.title === title
            && (!normalizedCurrent || normalizePreviewFilePath(item.def.filePath) === normalizedCurrent)
        ));
    return matches.length === 1 ? matches[0].index : -1;
}

function clientLabels(labels: Record<string, LabelData>): Record<string, LabelData> {
    return Object.fromEntries(Object.entries(labels).map(([id, label]) => {
        const { content: _content, ...metadata } = label;
        return [id, stripUndefinedFields(metadata)];
    }));
}

function clientDefinitions(definitions: RuntimeDefinitionData[], currentFilePath: string): RuntimeDefinitionData[] {
    const normalizedCurrent = normalizePreviewFilePath(currentFilePath);
    return definitions.map(definition => {
        const isCurrentFile = normalizedCurrent
            && normalizePreviewFilePath(definition.filePath) === normalizedCurrent;
        if (isCurrentFile) return definition;

        const { content: _content, ...metadata } = definition;
        return stripUndefinedFields(metadata) as RuntimeDefinitionData;
    });
}

function renderDefinitionTemplates(md: any, definitions: RuntimeDefinitionData[], env: any): string {
    return definitions.map((def, index) => ({ def, index }))
        .map(({ def, index }) => {
            const renderedContent = def.content
                ? md.render(def.content, {
                    ...env,
                    tooltipDepth: 1,
                    formalTooltipCache: env.formalTooltipCache || {}
                })
                : '';
            const safeHtml = inlineSafeRenderedMarkdown(renderedContent).replace(/<\/template/gi, '&lt;/template');
            return `<template data-definition-index="${index}">${safeHtml}</template>`;
        }).join('\n');
}

function renderSymbolTemplates(md: any, symbols: RuntimeSymbolData[], env: any, includeIndexes?: Set<number>): string {
    return symbols.map((symbol, index) => ({ symbol, index }))
        .filter(({ index }) => !includeIndexes || includeIndexes.has(index))
        .map(({ symbol, index }) => {
            const display = symbol.display ? md.render(symbol.display, { ...env, tooltipDepth: 1 }) : '';
            const meaning = symbol.meaning ? md.render(symbol.meaning, { ...env, tooltipDepth: 1 }) : '';
            const safeDisplay = inlineSafeRenderedMarkdown(display).replace(/<\/template/gi, '&lt;/template');
            const safeMeaning = inlineSafeRenderedMarkdown(meaning).replace(/<\/template/gi, '&lt;/template');
            return `<template data-symbol-display-index="${index}">${safeDisplay}</template>\n<template data-symbol-meaning-index="${index}">${safeMeaning}</template>`;
        }).join('\n');
}

function normalizeLatexSymbolForMatch(value: string): string {
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

function makeUnanchoredSymbolRegex(symbol: RuntimeSymbolData): RegExp | undefined {
    const source = String(symbol.regex || '')
        .replace(/^\^/, '')
        .replace(/\$$/, '');
    if (!source || source === '(.+?)') return undefined;

    try {
        return new RegExp(source);
    } catch (_err) {
        return undefined;
    }
}

function symbolMatchesFormula(symbol: RuntimeSymbolData, formula: FormulaData): boolean {
    const latex = normalizeLatexSymbolForMatch(formula.latex);
    if (!latex) return false;

    const regex = makeUnanchoredSymbolRegex(symbol);
    if (regex && regex.test(latex)) return true;

    const pattern = normalizeLatexSymbolForMatch(symbol.pattern);
    if (pattern && !pattern.includes('${') && latex.includes(pattern)) return true;

    const display = normalizeLatexSymbolForMatch(symbol.display);
    return Boolean(display && latex.includes(display));
}

function symbolTemplateIndexesForFormulas(symbols: RuntimeSymbolData[], formulas: FormulaData[]): Set<number> {
    const indexes = new Set<number>();
    if (formulas.length === 0) return indexes;

    symbols.forEach((symbol, index) => {
        if (formulas.some(formula => symbolMatchesFormula(symbol, formula))) {
            indexes.add(index);
        }
    });

    return indexes;
}

function isEscaped(src: string, index: number): boolean {
    let slashes = 0;
    for (let i = index - 1; i >= 0 && src[i] === '\\'; i--) slashes++;
    return slashes % 2 === 1;
}

function extractLatexFormulas(src: string): FormulaData[] {
    const formulas: FormulaData[] = [];
    let inFence = false;
    let blockDelimiter = '';
    let blockBuffer: string[] = [];

    const lines = String(src || '').split(/\r?\n/);
    for (const line of lines) {
        if (/^\s*(```|~~~)/.test(line)) {
            inFence = !inFence;
            continue;
        }
        if (inFence) continue;

        if (blockDelimiter) {
            const close = line.indexOf(blockDelimiter);
            if (close >= 0) {
                const delimiter = blockDelimiter;
                blockBuffer.push(line.slice(0, close));
                formulas.push({ latex: blockBuffer.join('\n').trim(), display: true });
                blockDelimiter = '';
                blockBuffer = [];
                scanInlineMath(line.slice(close + delimiter.length), formulas);
            } else {
                blockBuffer.push(line);
            }
            continue;
        }

        const blockStart = line.search(/(?:\$\$|\\\[)/);
        if (blockStart >= 0) {
            const delimiter = line.slice(blockStart, blockStart + 2);
            const closeDelimiter = delimiter === '$$' ? '$$' : '\\]';
            const close = line.indexOf(closeDelimiter, blockStart + 2);
            if (close >= 0) {
                scanInlineMath(line.slice(0, blockStart), formulas);
                formulas.push({ latex: line.slice(blockStart + 2, close).trim(), display: true });
                scanInlineMath(line.slice(close + 2), formulas);
            } else {
                scanInlineMath(line.slice(0, blockStart), formulas);
                blockDelimiter = closeDelimiter;
                blockBuffer = [line.slice(blockStart + 2)];
            }
            continue;
        }

        scanInlineMath(line, formulas);
    }

    return formulas.filter(formula => formula.latex);
}

function scanInlineMath(line: string, formulas: FormulaData[]) {
    for (let i = 0; i < line.length; i++) {
        if (line[i] === '\\' && line[i + 1] === '(' && !isEscaped(line, i)) {
            const end = line.indexOf('\\)', i + 2);
            if (end >= 0) {
                formulas.push({ latex: line.slice(i + 2, end).trim(), display: false });
                i = end + 1;
            }
            continue;
        }

        if (line[i] !== '$' || line[i + 1] === '$' || isEscaped(line, i)) continue;
        const end = findInlineDollarEnd(line, i + 1);
        if (end >= 0) {
            formulas.push({ latex: line.slice(i + 1, end).trim(), display: false });
            i = end;
        }
    }
}

function findInlineDollarEnd(line: string, start: number): number {
    for (let i = start; i < line.length; i++) {
        if (line[i] === '$' && line[i + 1] !== '$' && !isEscaped(line, i)) return i;
    }
    return -1;
}

function applyLightweightMarker(tokens: any[], inlineIndex: number, labels: Record<string, LabelData>, definitions: RuntimeDefinitionData[], currentFilePath: string, config: any) {
    const inlineToken = tokens[inlineIndex];
    const openToken = tokens[inlineIndex - 1];
    if (!inlineToken || !openToken) return;

    const isHeading = /^h[2-6]$/.test(openToken.tag || '');
    const line = isHeading
        ? `${'#'.repeat(Number(openToken.tag.slice(1)))} ${inlineToken.content || ''}`
        : String(inlineToken.content || '');
    const marker = parseFormalMarkerLine(line);
    if (!marker) return;
    if (isHeading && marker.type !== 'section') return;

    if (marker.type === 'def' && !marker.id) {
        const lineNumber = openToken.map ? openToken.map[0] + 1 : undefined;
        const definitionIndex = findDefinitionIndex(definitions, currentFilePath, lineNumber, marker.title);
        if (definitionIndex < 0) return;

        setAttr(openToken, 'id', definitionTargetId(definitionIndex));
        setAttr(openToken, 'dir', 'auto');
        setAttr(openToken, 'data-formal-definition-index', String(definitionIndex));
        setAttr(openToken, 'data-formal-title', marker.title || '');
        setAttr(openToken, 'data-formal-type', marker.type);
        if (openToken.map) setAttr(openToken, 'data-line', String(openToken.map[0]));
        addTokenClass(openToken, 'formal-definition');
        return;
    }

    if (!marker.id) return;

    const labelData = (labels[marker.id] || {
        type: marker.type,
        title: marker.title,
        filePath: ''
    }) as LabelData;
    const replacement = renderedMarkerPrefix(marker, labelData, config);
    const replacementText = replacement ? replacement : '';

    replaceFirstTextChild(inlineToken, marker.markerText, replacementText);
    setAttr(openToken, 'id', `formal-${marker.id}`);
    setAttr(openToken, 'dir', 'auto');
    setAttr(openToken, 'data-formal-title', labelData.title || marker.title || '');
    setAttr(openToken, 'data-formal-type', labelData.type || marker.type);
    setAttr(openToken, 'data-formal-display', replacementText);
    if (openToken.map) setAttr(openToken, 'data-line', String(openToken.map[0]));

    if (marker.type === 'section') {
        addTokenClass(openToken, 'formal-section');
    } else {
        addTokenClass(openToken, `formal-block formal-${escapeHtml(marker.type)}`);
    }
}

function addSourceLineAttributes(tokens: any[]) {
    for (const token of tokens) {
        if (!token || !Array.isArray(token.map) || token.nesting === -1) continue;

        const start = Number(token.map[0]);
        const end = Number(token.map[1]) - 1;
        if (!Number.isFinite(start) || !Number.isFinite(end)) continue;

        setAttr(token, 'data-line', String(start));
        setAttr(token, 'data-line-end', String(Math.max(start, end)));
    }
}

function normalizeEnvFilePath(rootPath: string, value: unknown): string {
    if (!value) return '';

    let raw = '';
    if (typeof value === 'string') {
        raw = value;
    } else if (typeof value === 'object') {
        const candidate = value as any;
        raw = candidate.fsPath || candidate.path || candidate.fileName || '';
    }

    if (!raw) return '';
    if (raw.startsWith('file://')) {
        raw = decodeURIComponent(raw.replace(/^file:\/\//, ''));
    }

    raw = raw.replace(/\\/g, '/');
    const normalizedRoot = rootPath.replace(/\\/g, '/');
    if (normalizedRoot && raw.startsWith(normalizedRoot)) {
        raw = raw.slice(normalizedRoot.length).replace(/^\/+/, '');
    }

    return raw.replace(/^\/+/, '');
}

function getCurrentFilePathFromEnv(rootPath: string, env: any): string {
    if (!env) return '';

    const candidates = [
        env.formalCurrentFilePath,
        env.filePath,
        env.path,
        env.resource,
        env.uri,
        env.markdownFile,
        env.currentDocument,
        env.currentDocument?.uri,
        env.document,
        env.document?.uri
    ];

    for (const candidate of candidates) {
        const normalized = normalizeEnvFilePath(rootPath, candidate);
        if (normalized) return normalized;
    }

    return '';
}

function envDebugSummary(env: any): Record<string, unknown> {
    if (!env || typeof env !== 'object') return {};

    const summary: Record<string, unknown> = {
        keys: Object.keys(env).sort()
    };
    for (const key of ['filePath', 'path', 'resource', 'uri', 'markdownFile', 'currentDocument', 'document']) {
        const value = env[key];
        if (value === undefined) continue;
        if (typeof value === 'string') {
            summary[key] = value;
            continue;
        }
        if (value && typeof value === 'object') {
            const candidate = value as any;
            summary[key] = {
                fsPath: candidate.fsPath,
                path: candidate.path,
                fileName: candidate.fileName,
                uri: candidate.uri ? {
                    fsPath: candidate.uri.fsPath,
                    path: candidate.uri.path
                } : undefined
            };
        }
    }
    return summary;
}

function inferCurrentFilePathFromSource(rootPath: string, src: string, pages: PageData[]): string {
    if (!rootPath || !src || pages.length === 0) return '';

    for (const page of pages) {
        const filePath = normalizePreviewFilePath(page.filePath);
        if (!filePath) continue;

        try {
            const fullPath = path.join(rootPath, filePath);
            const content = fs.readFileSync(fullPath, 'utf-8');
            if (content.length === src.length && content === src) return filePath;
        } catch (_err) {
            // Best-effort fallback only.
        }
    }

    return '';
}

function getCurrentFilePath(rootPath: string, env: any, src: string, pages: PageData[]): string {
    return getCurrentFilePathFromEnv(rootPath, env)
        || inferCurrentFilePathFromSource(rootPath, src, pages);
}

export = function formalPlugin(md: any, options: any) {
    const rootPath = options ? options.rootPath : '';
    let cachedLabels: Record<string, LabelData> = {};
    let cachedPages: PageData[] = [];
    let cachedDefinitions: RuntimeDefinitionData[] = [];
    let cachedSymbols: RuntimeSymbolData[] = [];
    let cachedConfig: any = mergeConfig(DEFAULT_CONFIG);

    function traceCore(event: string, state: any) {
        if (state?.env?.tooltipDepth) return;
        appendPreviewDebugLog(rootPath, cachedConfig, event, {
            filePath: getCurrentFilePath(rootPath, state?.env, state?.src || '', cachedPages || []) || '(unknown)',
            tokenCount: Array.isArray(state?.tokens) ? state.tokens.length : undefined,
            srcChars: String(state?.src || '').length,
            inlineRuleCalls: state?.env?.formalInlineRuleCalls,
            inlineMatches: state?.env?.formalInlineMatches
        });
    }

    md.core.ruler.after('normalize', 'formal_trace_after_normalize', (state: any) => {
        traceCore('render:after-normalize', state);
    });

    md.core.ruler.after('block', 'formal_trace_after_block', (state: any) => {
        traceCore('render:after-block', state);
    });

    md.core.ruler.before('inline', 'formal_trace_before_inline', (state: any) => {
        state.env = state.env || {};
        state.env.formalInlineRuleCalls = 0;
        state.env.formalInlineMatches = 0;
        traceCore('render:before-inline', state);
    });

    md.core.ruler.after('inline', 'formal_trace_after_inline', (state: any) => {
        traceCore('render:after-inline', state);
    });
    
    // Core rule to load the preview index once per render.
    md.core.ruler.before('normalize', 'formal_load_preview_index', (state: any) => {
        if (state.env && state.env.tooltipDepth) {
            state.env.labels = cachedLabels;
            state.env.pages = cachedPages;
            state.env.definitions = cachedDefinitions;
            state.env.symbols = cachedSymbols;
            return;
        }

        if (!rootPath) return;
        state.env = state.env || {};
        const startedAt = Date.now();
        let currentFilePath = getCurrentFilePathFromEnv(rootPath, state.env);
        const configPath = path.join(rootPath, '.markdown-formal', 'config.json');
        try {
            if (fs && fs.existsSync && fs.existsSync(configPath)) {
                cachedConfig = mergeConfig(JSON.parse(fs.readFileSync(configPath, 'utf-8')));
            } else {
                cachedConfig = mergeConfig(DEFAULT_CONFIG);
            }
        } catch (e: any) {
            cachedConfig = mergeConfig(DEFAULT_CONFIG);
            appendPreviewDebugLog(rootPath, cachedConfig, 'render:config-error', {
                filePath: currentFilePath || '(unknown)',
                error: e?.message || String(e)
            });
        }

        appendPreviewDebugLog(rootPath, cachedConfig, 'render:load:start', {
            filePath: currentFilePath || '(unknown)',
            srcChars: String(state.src || '').length,
            env: envDebugSummary(state.env)
        });

        const cachePath = path.join(rootPath, '.markdown-formal', 'preview-cache.json');
        try {
            if (fs && fs.existsSync && fs.existsSync(cachePath)) {
                const readStartedAt = Date.now();
                const rawCache = fs.readFileSync(cachePath, 'utf-8');
                const data = JSON.parse(rawCache);
                cachedLabels = data.entries || {};
                cachedPages = Array.isArray(data.pages) ? data.pages : [];
                cachedDefinitions = Array.isArray(data.definitions) ? data.definitions : [];
                cachedSymbols = Array.isArray(data.symbols) ? data.symbols : [];
                if (!currentFilePath) {
                    currentFilePath = inferCurrentFilePathFromSource(rootPath, state.src || '', cachedPages);
                }
                state.env.labels = cachedLabels;
                state.env.pages = cachedPages;
                state.env.definitions = cachedDefinitions;
                state.env.symbols = cachedSymbols;
                state.env.formalCurrentFilePath = currentFilePath;
                appendPreviewDebugLog(rootPath, cachedConfig, 'render:cache-loaded', {
                    filePath: currentFilePath || '(unknown)',
                    inferredFilePath: currentFilePath || undefined,
                    cacheChars: rawCache.length,
                    labels: Object.keys(cachedLabels).length,
                    pages: cachedPages.length,
                    definitions: cachedDefinitions.length,
                    symbols: cachedSymbols.length,
                    elapsedMs: elapsedMs(readStartedAt)
                });
            } else {
                cachedLabels = {};
                cachedPages = [];
                cachedDefinitions = [];
                cachedSymbols = [];
                appendPreviewDebugLog(rootPath, cachedConfig, 'render:cache-missing', {
                    filePath: currentFilePath || '(unknown)',
                    cachePath
                });
            }
        } catch (e: any) {
            console.error('[markdown-formal] Failed to load preview-cache.json:', e);
            appendPreviewDebugLog(rootPath, cachedConfig, 'render:cache-error', {
                filePath: currentFilePath || '(unknown)',
                cachePath,
                error: e?.message || String(e)
            });
            cachedLabels = {};
            cachedPages = [];
            cachedDefinitions = [];
            cachedSymbols = [];
        }

        appendPreviewDebugLog(rootPath, cachedConfig, 'render:load:end', {
            filePath: currentFilePath || '(unknown)',
            elapsedMs: elapsedMs(startedAt)
        });
    });

    // Inject labels data at the end of the document for frontend JS
    md.core.ruler.push('formal_inject_data', (state: any) => {
        if (state.env && state.env.tooltipDepth) return;

        const startedAt = Date.now();
        const rawCurrentFilePath = getCurrentFilePath(rootPath, state.env, state.src || '', cachedPages || []);
        state.env = state.env || {};
        state.env.formalCurrentFilePath = rawCurrentFilePath;

        try {
            appendPreviewDebugLog(rootPath, cachedConfig, 'render:inject:start', {
                filePath: rawCurrentFilePath || '(unknown)',
                srcChars: String(state.src || '').length,
                tokenCount: Array.isArray(state.tokens) ? state.tokens.length : undefined
            });

            const token = new state.Token('html_block', '', 0);
            const clientLabelData = clientLabels(cachedLabels || {});
            const clientDefinitionData = clientDefinitions(cachedDefinitions || [], rawCurrentFilePath);
            const formulas = extractLatexFormulas(state.src || '');
            const currentSymbolTemplateIndexes = symbolTemplateIndexesForFormulas(cachedSymbols || [], formulas);
            const dataStr = escapeHtml(JSON.stringify(clientLabelData));
            const pagesStr = escapeHtml(JSON.stringify(cachedPages || []));
            const definitionsStr = escapeHtml(JSON.stringify(clientDefinitionData));
            const symbolsStr = escapeHtml(JSON.stringify(cachedSymbols || []));
            const formulasStr = escapeHtml(JSON.stringify(formulas));
            const configStr = escapeHtml(JSON.stringify(cachedConfig || mergeConfig(DEFAULT_CONFIG)));
            const currentFilePath = escapeHtml(rawCurrentFilePath);
            const tooltipStats = tooltipRenderStats(state.src || '', cachedLabels || {});
            const hoverIgnoredByConfig = shouldIgnorePreviewHover(rawCurrentFilePath, cachedConfig);
            state.env.ignoreFormalTooltips = !shouldEagerRenderTooltips(rawCurrentFilePath, cachedConfig);
            const ignoreReason = hoverIgnoredByConfig ? 'config' : 'none';
            appendPreviewDebugLog(rootPath, cachedConfig, 'render:inject:data', {
                filePath: rawCurrentFilePath || '(unknown)',
                labels: Object.keys(cachedLabels || {}).length,
                pages: (cachedPages || []).length,
                definitions: (cachedDefinitions || []).length,
                symbols: (cachedSymbols || []).length,
                formulas: formulas.length,
                clientLabelsChars: objectChars(clientLabelData),
                clientDefinitionsChars: objectChars(clientDefinitionData),
                symbolsChars: objectChars(cachedSymbols || []),
                formulasChars: objectChars(formulas),
                hoverIgnored: state.env.ignoreFormalTooltips,
                ignoreReason,
                ...tooltipStats
            });
            if (state.env.ignoreFormalTooltips) {
                console.warn('[markdown-formal] Skipped inline ref tooltips for configured preview', {
                    filePath: rawCurrentFilePath || '(unknown)',
                    reason: ignoreReason,
                    ...tooltipStats
                });
            }

            const templatesStartedAt = Date.now();
            const definitionTemplates = renderDefinitionTemplates(md, cachedDefinitions || [], state.env || {});
            const symbolTemplates = renderSymbolTemplates(md, cachedSymbols || [], state.env || {}, currentSymbolTemplateIndexes);
            appendPreviewDebugLog(rootPath, cachedConfig, 'render:inject:templates', {
                filePath: rawCurrentFilePath || '(unknown)',
                definitionTemplateChars: definitionTemplates.length,
                symbolTemplateChars: symbolTemplates.length,
                symbolTemplateCount: currentSymbolTemplateIndexes.size,
                elapsedMs: elapsedMs(templatesStartedAt)
            });

            token.content = `<div id="formal-labels-data" style="display:none;" data-labels="${dataStr}"></div>\n<div id="formal-pages-data" style="display:none;" data-pages="${pagesStr}" data-current-file="${currentFilePath}"></div>\n<div id="formal-definitions-data" style="display:none;" data-definitions="${definitionsStr}"></div>\n<div id="formal-symbols-data" style="display:none;" data-symbols="${symbolsStr}"></div>\n<div id="formal-formulas-data" style="display:none;" data-formulas="${formulasStr}"></div>\n<div id="formal-definition-templates" style="display:none;">${definitionTemplates}</div>\n<div id="formal-symbol-templates" style="display:none;">${symbolTemplates}</div>\n<div id="formal-config-data" style="display:none;" data-config="${configStr}"></div>\n`;
            state.tokens.push(token);
            appendPreviewDebugLog(rootPath, cachedConfig, 'render:inject:end', {
                filePath: rawCurrentFilePath || '(unknown)',
                injectedChars: token.content.length,
                elapsedMs: elapsedMs(startedAt)
            });
        } catch (e: any) {
            appendPreviewDebugLog(rootPath, cachedConfig, 'render:inject:error', {
                filePath: rawCurrentFilePath || '(unknown)',
                elapsedMs: elapsedMs(startedAt),
                error: e?.message || String(e)
            });
            throw e;
        }
    });

    md.core.ruler.after('inline', 'formal_lightweight_markers', (state: any) => {
        if (state.env && state.env.tooltipDepth) return;
        const startedAt = Date.now();
        const currentFilePath = normalizePreviewFilePath(getCurrentFilePath(rootPath, state.env, state.src || '', cachedPages || []));
        let inlineCount = 0;
        try {
            appendPreviewDebugLog(rootPath, cachedConfig, 'render:markers:start', {
                filePath: currentFilePath || '(unknown)',
                tokenCount: Array.isArray(state.tokens) ? state.tokens.length : undefined
            });
            addSourceLineAttributes(state.tokens);
            for (let i = 0; i < state.tokens.length; i++) {
                if (state.tokens[i].type === 'inline') {
                    inlineCount++;
                    applyLightweightMarker(state.tokens, i, cachedLabels || {}, cachedDefinitions || [], currentFilePath, cachedConfig);
                }
            }
            appendPreviewDebugLog(rootPath, cachedConfig, 'render:markers:end', {
                filePath: currentFilePath || '(unknown)',
                tokenCount: Array.isArray(state.tokens) ? state.tokens.length : undefined,
                inlineCount,
                elapsedMs: elapsedMs(startedAt)
            });
        } catch (e: any) {
            appendPreviewDebugLog(rootPath, cachedConfig, 'render:markers:error', {
                filePath: currentFilePath || '(unknown)',
                inlineCount,
                elapsedMs: elapsedMs(startedAt),
                error: e?.message || String(e)
            });
            throw e;
        }
    });

    // Inline rule for @p-123 and @p-123.title
    md.inline.ruler.before('link', 'formal_inline', (state: any, silent: boolean) => {
        if (state.env) state.env.formalInlineRuleCalls = (state.env.formalInlineRuleCalls || 0) + 1;
        const start = state.pos;
        if (state.src.charCodeAt(start) !== 0x40 /* @ */) return false;
        
        const match = state.src.slice(start).match(/^@([a-zA-Z0-9_-]+)(\.title)?/);
        if (!match) return false;
        
        // Silent mode is used while markdown-it scans link labels like [@h-...].
        // Returning true without consuming text can stall that scanner.
        if (silent) return false;
        
        const id = match[1];
        const isTitle = !!match[2];
        if (state.env) state.env.formalInlineMatches = (state.env.formalInlineMatches || 0) + 1;
        
        const token = state.push('formal_inline', '', 0);
        token.meta = { id, isTitle };
        
        state.pos += match[0].length;
        return true;
    });

    // Auto-trim spaces around formal_inline when adjacent to Chinese characters
    md.core.ruler.after('inline', 'formal_trim_cjk_spaces', (state: any) => {
        if (state.env && state.env.tooltipDepth) return;
        const startedAt = Date.now();
        const currentFilePath = normalizePreviewFilePath(getCurrentFilePath(rootPath, state.env, state.src || '', cachedPages || []));
        let formalInlineCount = 0;
        try {
            appendPreviewDebugLog(rootPath, cachedConfig, 'render:trim:start', {
                filePath: currentFilePath || '(unknown)',
                tokenCount: Array.isArray(state.tokens) ? state.tokens.length : undefined
            });
            for (const blkToken of state.tokens) {
                if (blkToken.type !== 'inline') continue;
                const children = blkToken.children;
                if (!children) continue;

                for (let i = 0; i < children.length; i++) {
                    if (children[i].type === 'formal_inline') {
                        formalInlineCount++;
                        // Check previous token: if it ends with CJK + space(s), trim the space
                        if (i > 0 && children[i-1].type === 'text') {
                            children[i-1].content = children[i-1].content.replace(/([\u4e00-\u9fa5])\s+$/, '$1');
                        }
                        // Check next token: if it starts with space(s) + (CJK or Chinese punctuation), trim the space
                        if (i < children.length - 1 && children[i+1].type === 'text') {
                            children[i+1].content = children[i+1].content.replace(/^\s+([\u4e00-\u9fa5，。！？、；：”’）])/g, '$1');
                        }
                    }
                }
            }
            appendPreviewDebugLog(rootPath, cachedConfig, 'render:trim:end', {
                filePath: currentFilePath || '(unknown)',
                formalInlineCount,
                elapsedMs: elapsedMs(startedAt)
            });
        } catch (e: any) {
            appendPreviewDebugLog(rootPath, cachedConfig, 'render:trim:error', {
                filePath: currentFilePath || '(unknown)',
                formalInlineCount,
                elapsedMs: elapsedMs(startedAt),
                error: e?.message || String(e)
            });
            throw e;
        }
    });

    // Renderer for formal_inline
    md.renderer.rules.formal_inline = (tokens: any, idx: number, options: any, env: any, self: any) => {
        const token = tokens[idx];
        const { id, isTitle } = token.meta;
        const labels = cachedLabels || {};
        env.formalInlineRenderCalls = (env.formalInlineRenderCalls || 0) + 1;
        if (env.formalInlineRenderCalls === 1 || env.formalInlineRenderCalls % 25 === 0) {
            appendPreviewDebugLog(rootPath, cachedConfig, 'render:inline-render:progress', {
                filePath: getCurrentFilePath(rootPath, env, '', cachedPages || []) || '(unknown)',
                calls: env.formalInlineRenderCalls,
                id,
                isTitle
            });
        }
        const labelData = labels[id];
        
        if (!labelData) {
            return `<span style="color:red; font-weight:bold">@${escapeHtml(id)}</span>`;
        }
        
        const dict = getDictionary(cachedConfig);
        const typeName = dict[labelData.type] || labelData.type;
        const space = /^[A-Za-z]/.test(typeName) ? ' ' : '';
        
        let text = '';
        if (isTitle) {
            text = labelData.title || id;
        } else {
            const labelNumber = formatLabelNumber(labelData);
            if (labelNumber) {
                text = `${typeName}${space}${labelNumber}`;
            } else if (labelData.title) {
                text = labelData.title;
            } else {
                text = typeName;
            }
        }
        
        const uri = normalizeFileHref(rootPath, labelData.filePath || '', id);
        const targetLineAttr = labelData.startLine !== undefined ? ` data-target-line="${labelData.startLine + 1}"` : '';
        
        let tooltipHtml = '';
        if (labelData.type !== 'section' && labelData.content && (env.tooltipDepth || 0) === 0 && !env.ignoreFormalTooltips) {
            env.formalTooltipCache = env.formalTooltipCache || {};
            
            if (env.formalTooltipCache[id] !== undefined) {
                tooltipHtml = env.formalTooltipCache[id];
            } else {
                // Re-render the captured content using the same md instance
                const renderedContent = md.render(labelData.content, {
                    ...env,
                    tooltipDepth: 1,
                    formalTooltipCache: env.formalTooltipCache
                });
                const safeHtml = inlineSafeRenderedMarkdown(renderedContent);
                    
                let headerTextTooltip = typeName;
                if (labelData.type === 'section') {
                    headerTextTooltip = '';
                    headerTextTooltip = formatLabelNumber(labelData);
                    if (labelData.title) headerTextTooltip += (headerTextTooltip ? ' ' : '') + labelData.title;
                } else {
                    const labelNumber = formatLabelNumber(labelData);
                    if (labelNumber) headerTextTooltip += `${space}${labelNumber}`;
                    if (labelData.title) headerTextTooltip += ` (${labelData.title})`;
                }
                const colon = getColon(cachedConfig);
                const headerHtml = `<span class="formal-tooltip-header">${escapeHtml(headerTextTooltip)}${colon}</span>`;
                
                tooltipHtml = `<span class="formal-tooltip">${headerHtml}${safeHtml}</span>`;
                env.formalTooltipCache[id] = tooltipHtml;
            }
        }
        
        const titleAttr = typeName + (labelData.title ? getColon(cachedConfig) + labelData.title : '');
        return `<span class="formal-ref-wrap"><a class="formal-ref" href="${escapeHtml(uri)}" data-href="${escapeHtml(uri)}"${targetLineAttr} title="${escapeHtml(titleAttr)}" style="color: inherit; text-decoration: none;">${escapeHtml(text)}</a>${tooltipHtml}</span>`;
    };
};
