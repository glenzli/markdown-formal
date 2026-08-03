import * as fs from 'fs';
import * as path from 'path';
import {
    DEFAULT_CONFIG,
    findSymbolsInMarkdown,
    formatPageHeadingPrefix,
    formatPageReference,
    formatDisplayNumber,
    getLanguage,
    mergeConfig,
    normalizeFormalPagePath,
    parseFormalMarkerLine,
    shouldIgnorePreviewHover,
    type RuntimeDefinitionData,
    type RuntimeSymbolData
} from '@math-workspace/core';
import { appendPreviewDebugLog } from '@math-workspace/core/debug-log';

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
    id?: string;
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
    line?: number;
    level?: number;
}

type FormalInlineMode = 'default' | 'title' | 'full';

interface TooltipRenderStats {
    refCount: number;
    referencedIdCount: number;
    contentChars: number;
}

interface TooltipRuntimeStats {
    generatedCount: number;
    cacheHits: number;
    renderMs: number;
    contentChars: number;
    htmlChars: number;
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

function cheapHash(value: string): string {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
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

function normalizePageHref(filePath: string): string {
    if (!filePath) return '#';
    return `/${encodeURI(filePath)}`;
}

function normalizePreviewFilePath(filePath: string): string {
    return String(filePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function definitionTargetId(index: number): string {
    return `formal-def-${index}`;
}

function referencedFormalIds(src: string): string[] {
    return uniqueValues(Array.from(src.matchAll(/@([a-zA-Z0-9_-]+)(?:\.(?:title|full))?\b(?!:)/g), match => match[1]));
}

function countFormalRefs(src: string): number {
    return Array.from(src.matchAll(/@([a-zA-Z0-9_-]+)(?:\.(?:title|full))?\b(?!:)/g)).length;
}

function tooltipRenderStats(src: string, labels: Record<string, LabelData>): TooltipRenderStats {
    const refCount = countFormalRefs(src);
    const contentChars = referencedFormalIds(src).reduce((sum, id) => {
        const label = labels[id];
        if (!label || label.type === 'section' || isPageLabelData(label)) return sum;
        return sum + String(label.content || '').length;
    }, 0);
    return {
        refCount,
        referencedIdCount: referencedFormalIds(src).length,
        contentChars
    };
}

function getRuntimeTooltipStats(env: any): TooltipRuntimeStats {
    env.formalTooltipStats = env.formalTooltipStats || {
        generatedCount: 0,
        cacheHits: 0,
        renderMs: 0,
        contentChars: 0,
        htmlChars: 0
    };
    return env.formalTooltipStats;
}

function hasFormalPreviewConfig(rootPath: string): boolean {
    return Boolean(rootPath && fs.existsSync(path.join(rootPath, '.math-workspace', 'config.json')));
}

function hasFormalPreviewCache(rootPath: string): boolean {
    return Boolean(rootPath && fs.existsSync(path.join(rootPath, '.math-workspace', 'preview-cache.json')));
}

function findFormalPreviewRoot(startPath: string): string {
    let current = startPath;
    while (current) {
        if (hasFormalPreviewConfig(current)) return current;
        const parent = path.dirname(current);
        if (!parent || parent === current) break;
        current = parent;
    }
    return '';
}

function disableFormalPreview(env: any, reason: string) {
    if (!env) return;
    env.formalPreviewEnabled = false;
    env.formalPreviewDisabledReason = reason;
    delete env.labels;
    delete env.pages;
    delete env.definitions;
    delete env.symbols;
    delete env.formalCurrentFilePath;
}

function enableFormalPreview(env: any) {
    if (!env) return;
    env.formalPreviewEnabled = true;
    delete env.formalPreviewDisabledReason;
}

function isFormalPreviewEnabled(env: any): boolean {
    return Boolean(env?.formalPreviewEnabled);
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
    if (labelData.type === 'remark' || ['chapter', 'intro', 'summary', 'appendix'].includes(labelData.type)) return '';
    const prefix = getNumberPrefix(labelData);
    return prefix && labelData.number !== undefined ? `${prefix}.${labelData.number}` : '';
}

function isPageLabelData(labelData: LabelData | undefined): boolean {
    return !!labelData && ['chapter', 'intro', 'summary', 'appendix'].includes(labelData.type);
}

function pageDataFromLabel(labelData: LabelData): PageData {
    return {
        kind: labelData.type,
        filePath: labelData.filePath,
        title: labelData.title,
        order: typeof labelData.unitOrder === 'number' ? labelData.unitOrder : 0,
        bookKey: labelData.bookKey,
        bookTitle: labelData.bookTitle,
        bookOrder: labelData.bookOrder,
        volumeKey: labelData.volumeKey,
        volumeTitle: labelData.volumeTitle,
        volumeOrder: labelData.volumeOrder,
        unitKind: labelData.unitKind,
        unitKey: labelData.unitKey,
        unitLabel: labelData.unitLabel,
        unitOrder: labelData.unitOrder,
        chapter: labelData.chapter,
        appendix: labelData.appendix,
        line: labelData.startLine !== undefined ? labelData.startLine + 1 : undefined
    };
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

function replaceFirstTextChild(inlineToken: any, from: string, to: string): boolean {
    inlineToken.content = String(inlineToken.content || '').replace(from, to);
    if (!inlineToken.children) return false;

    const replaceInChildren = (children: any[]): boolean => {
        for (const child of children) {
            if (child.type === 'text') {
                const next = String(child.content || '').replace(from, to);
                if (next !== child.content) {
                    child.content = next;
                    return true;
                }
            }

            if (Array.isArray(child.children) && replaceInChildren(child.children)) {
                return true;
            }
        }

        return false;
    };

    return replaceInChildren(inlineToken.children);
}

function textChildrenInOrder(inlineToken: any): any[] {
    const result: any[] = [];
    const visit = (children: any[]) => {
        for (const child of children || []) {
            if (!child) continue;
            if (child.type === 'text') result.push(child);
            if (Array.isArray(child.children)) visit(child.children);
        }
    };
    visit(inlineToken.children || []);
    return result;
}

function inlineChildrenSnapshot(inlineToken: any): Array<{ type: string; tag?: string; content?: string }> {
    return (inlineToken.children || []).map((child: any) => ({
        type: String(child?.type || ''),
        tag: child?.tag ? String(child.tag) : undefined,
        content: child?.content === undefined ? undefined : String(child.content)
    }));
}

function replaceMarkerPrefix(inlineToken: any, marker: any, replacementText: string): boolean {
    if (replaceFirstTextChild(inlineToken, marker.markerText, replacementText)) return true;
    if (!marker.id) return false;

    const markerId = `#${marker.id}`;
    const children = textChildrenInOrder(inlineToken);
    const idIndex = children.findIndex(child => String(child.content || '').includes(markerId));
    if (idIndex < 0) return false;

    for (let i = 0; i < idIndex; i++) {
        children[i].content = '';
    }

    const child = children[idIndex];
    const content = String(child.content || '');
    const offset = content.indexOf(markerId);
    child.content = `${replacementText}${content.slice(offset + markerId.length)}`;
    inlineToken.content = String(inlineToken.content || '').replace(marker.markerText, replacementText);
    return true;
}

function trimLeadingInlineText(inlineToken: any): void {
    inlineToken.content = String(inlineToken.content || '').replace(/^\s+/, '');
    const children = textChildrenInOrder(inlineToken);
    for (const child of children) {
        const original = String(child.content || '');
        const trimmed = original.replace(/^\s+/, '');
        child.content = trimmed;
        if (trimmed.length > 0 || original.length === trimmed.length) break;
    }
}

interface MarkerApplyResult {
    parsed: boolean;
    replaced: boolean;
    missingLabel?: string;
}

function emptyMarkerResult(): MarkerApplyResult {
    return { parsed: false, replaced: false };
}

function markerTypeName(config: any, type: string): string {
    const dict = getDictionary(config);
    return dict[type] || type;
}

function usesSpacedDisplayNumber(typeName: string, type: string): boolean {
    return /^[A-Za-z]/.test(typeName) || ['equation', 'figure', 'table'].includes(type);
}

function renderedMarkerPrefix(marker: any, labelData: LabelData, config: any): string {
    if (isPageLabelData(labelData)) {
        return formatPageHeadingPrefix(pageDataFromLabel(labelData), config);
    }

    if (marker.type === 'section') {
        return formatLabelNumber(labelData);
    }

    const typeName = markerTypeName(config, labelData.type || marker.type);
    const number = formatDisplayNumber(labelData);
    const space = usesSpacedDisplayNumber(typeName, labelData.type || marker.type) ? ' ' : '';
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

function definitionTemplateIndexesForFile(definitions: RuntimeDefinitionData[], currentFilePath: string): Set<number> {
    const normalizedCurrent = normalizePreviewFilePath(currentFilePath);
    const indexes = new Set<number>();
    if (!normalizedCurrent) return indexes;

    definitions.forEach((definition, index) => {
        if (normalizePreviewFilePath(definition.filePath) === normalizedCurrent) {
            indexes.add(index);
        }
    });

    return indexes;
}

function renderDefinitionTemplates(md: any, definitions: RuntimeDefinitionData[], env: any, includeIndexes?: Set<number>): string {
    return definitions.map((def, index) => ({ def, index }))
        .filter(({ index }) => !includeIndexes || includeIndexes.has(index))
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

function renderInlineTitle(md: any, title: string, env: any): string {
    const rendered = typeof md.renderInline === 'function'
        ? md.renderInline(title, { ...env, tooltipDepth: 1 })
        : md.render(title, { ...env, tooltipDepth: 1 });
    return inlineSafeRenderedMarkdown(rendered).replace(/<\/template/gi, '&lt;/template');
}

function renderTitleTemplates(md: any, labels: Record<string, LabelData>, pages: PageData[], env: any): string {
    const entries: Array<{ kind: 'label' | 'page'; key: string; title: string }> = [];
    Object.entries(labels || {}).forEach(([id, label]) => {
        if (label?.title) entries.push({ kind: 'label', key: id, title: label.title });
    });
    (pages || []).forEach(page => {
        const key = normalizePreviewFilePath(page.filePath);
        if (key && page.title) entries.push({ kind: 'page', key, title: page.title });
    });

    const seen = new Set<string>();
    return entries
        .filter(entry => {
            const key = `${entry.kind}:${entry.key}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .map(entry => {
            const safeHtml = renderInlineTitle(md, entry.title, env);
            return `<template data-title-kind="${entry.kind}" data-title-key="${escapeHtml(entry.key)}">${safeHtml}</template>`;
        })
        .join('\n');
}

function applyLightweightMarker(tokens: any[], inlineIndex: number, labels: Record<string, LabelData>, definitions: RuntimeDefinitionData[], currentFilePath: string, config: any): MarkerApplyResult {
    const inlineToken = tokens[inlineIndex];
    const openToken = tokens[inlineIndex - 1];
    if (!inlineToken || !openToken) return emptyMarkerResult();

    const isHeading = /^h[1-6]$/.test(openToken.tag || '');
    const line = isHeading
        ? `${'#'.repeat(Number(openToken.tag.slice(1)))} ${inlineToken.content || ''}`
        : String(inlineToken.content || '');
    const marker = parseFormalMarkerLine(line);
    if (!marker) return emptyMarkerResult();
    if (isHeading && marker.type !== 'section') return { parsed: true, replaced: false };

    if (marker.type === 'def' && !marker.id) {
        const lineNumber = openToken.map ? openToken.map[0] + 1 : undefined;
        const definitionIndex = findDefinitionIndex(definitions, currentFilePath, lineNumber, marker.title);
        if (definitionIndex < 0) return { parsed: true, replaced: false };

        setAttr(openToken, 'id', definitionTargetId(definitionIndex));
        setAttr(openToken, 'dir', 'auto');
        setAttr(openToken, 'data-formal-definition-index', String(definitionIndex));
        setAttr(openToken, 'data-formal-title', marker.title || '');
        setAttr(openToken, 'data-formal-type', marker.type);
        if (openToken.map) setAttr(openToken, 'data-line', String(openToken.map[0]));
        addTokenClass(openToken, 'formal-definition');
        return { parsed: true, replaced: true };
    }

    if (!marker.id) return { parsed: true, replaced: false };

    const labelData = labels[marker.id];
    if (!labelData) {
        return { parsed: true, replaced: false, missingLabel: marker.id };
    }

    const replacement = renderedMarkerPrefix(marker, labelData, config);
    const replacementText = replacement ? replacement : '';

    const replaced = replaceMarkerPrefix(inlineToken, marker, replacementText);
    if (isPageLabelData(labelData)) {
        trimLeadingInlineText(inlineToken);
    }
    setAttr(openToken, 'id', `formal-${marker.id}`);
    setAttr(openToken, 'dir', 'auto');
    setAttr(openToken, 'data-formal-title', labelData.title || marker.title || '');
    setAttr(openToken, 'data-formal-type', labelData.type || marker.type);
    setAttr(openToken, 'data-formal-display', replacementText);
    if (openToken.map) setAttr(openToken, 'data-line', String(openToken.map[0]));

    if (isPageLabelData(labelData)) {
        addTokenClass(openToken, 'formal-page-anchor');
    } else if (marker.type === 'section') {
        addTokenClass(openToken, 'formal-section');
    } else {
        addTokenClass(openToken, `formal-block formal-${escapeHtml(marker.type)}`);
    }

    return { parsed: true, replaced };
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

function formalPlugin(md: any, options: any) {
    const requestedRootPath = options ? options.rootPath : '';
    const rootPath = findFormalPreviewRoot(requestedRootPath) || requestedRootPath;
    let cachedLabels: Record<string, LabelData> = {};
    let cachedPages: PageData[] = [];
    let cachedDefinitions: RuntimeDefinitionData[] = [];
    let cachedSymbols: RuntimeSymbolData[] = [];
    let cachedConfig: any = mergeConfig(DEFAULT_CONFIG);

    function resetPreviewCache() {
        cachedLabels = {};
        cachedPages = [];
        cachedDefinitions = [];
        cachedSymbols = [];
        cachedConfig = mergeConfig(DEFAULT_CONFIG);
    }

    function hasLoadedPreviewCache(): boolean {
        return Object.keys(cachedLabels || {}).length > 0
            || (cachedPages || []).length > 0
            || (cachedDefinitions || []).length > 0
            || (cachedSymbols || []).length > 0;
    }

    function canUseFormalPreview(env: any): boolean {
        return isFormalPreviewEnabled(env) || hasLoadedPreviewCache();
    }

    function traceCore(event: string, state: any) {
        if (state?.env?.tooltipDepth) return;
        if (!canUseFormalPreview(state?.env)) return;
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
        state.env = state.env || {};
        if (state.env && state.env.tooltipDepth) {
            state.env.labels = cachedLabels;
            state.env.pages = cachedPages;
            state.env.definitions = cachedDefinitions;
            state.env.symbols = cachedSymbols;
            if (hasLoadedPreviewCache()) enableFormalPreview(state.env);
            return;
        }

        if (!rootPath) {
            resetPreviewCache();
            disableFormalPreview(state.env, 'missing-root');
            return;
        }

        if (!hasFormalPreviewConfig(rootPath)) {
            resetPreviewCache();
            disableFormalPreview(state.env, 'missing-config');
            return;
        }

        const startedAt = Date.now();
        let currentFilePath = getCurrentFilePathFromEnv(rootPath, state.env);
        const configPath = path.join(rootPath, '.math-workspace', 'config.json');
        try {
            cachedConfig = mergeConfig(JSON.parse(fs.readFileSync(configPath, 'utf-8')));
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

        const cachePath = path.join(rootPath, '.math-workspace', 'preview-cache.json');
        try {
            if (hasFormalPreviewCache(rootPath)) {
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
                state.env.ignoreFormalTooltips = !shouldEagerRenderTooltips(currentFilePath, cachedConfig);
                enableFormalPreview(state.env);
                appendPreviewDebugLog(rootPath, cachedConfig, 'render:cache-loaded', {
                    filePath: currentFilePath || '(unknown)',
                    inferredFilePath: currentFilePath || undefined,
                    cacheChars: rawCache.length,
                    labels: Object.keys(cachedLabels).length,
                    pages: cachedPages.length,
                    definitions: cachedDefinitions.length,
                    symbols: cachedSymbols.length,
                    hoverIgnored: state.env.ignoreFormalTooltips,
                    elapsedMs: elapsedMs(readStartedAt)
                });
            } else {
                cachedLabels = {};
                cachedPages = [];
                cachedDefinitions = [];
                cachedSymbols = [];
                disableFormalPreview(state.env, 'missing-cache');
                appendPreviewDebugLog(rootPath, cachedConfig, 'render:cache-missing', {
                    filePath: currentFilePath || '(unknown)',
                    cachePath
                });
            }
        } catch (e: any) {
            console.error('[math-workspace] Failed to load preview-cache.json:', e);
            appendPreviewDebugLog(rootPath, cachedConfig, 'render:cache-error', {
                filePath: currentFilePath || '(unknown)',
                cachePath,
                error: e?.message || String(e)
            });
            cachedLabels = {};
            cachedPages = [];
            cachedDefinitions = [];
            cachedSymbols = [];
            disableFormalPreview(state.env, 'cache-error');
        }

        appendPreviewDebugLog(rootPath, cachedConfig, 'render:load:end', {
            filePath: currentFilePath || '(unknown)',
            elapsedMs: elapsedMs(startedAt)
        });
    });

    // Inject labels data at the end of the document for frontend JS
    md.core.ruler.push('formal_inject_data', (state: any) => {
        if (state.env && state.env.tooltipDepth) return;
        if (!canUseFormalPreview(state.env)) return;

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

            const dataStartedAt = Date.now();
            const token = new state.Token('html_block', '', 0);
            const clientLabelData = clientLabels(cachedLabels || {});
            const clientDefinitionData = clientDefinitions(cachedDefinitions || [], rawCurrentFilePath);
            const symbolMatchStartedAt = Date.now();
            const currentSymbolTemplateIndexes = findSymbolsInMarkdown(state.src || '', cachedSymbols || []).map(match => match.index);
            const currentSymbolTemplateIndexSet = new Set(currentSymbolTemplateIndexes);
            const symbolMatchElapsedMs = elapsedMs(symbolMatchStartedAt);
            const serializeStartedAt = Date.now();
            const dataStr = escapeHtml(JSON.stringify(clientLabelData));
            const pagesStr = escapeHtml(JSON.stringify(cachedPages || []));
            const definitionsStr = escapeHtml(JSON.stringify(clientDefinitionData));
            const symbolsStr = escapeHtml(JSON.stringify(cachedSymbols || []));
            const currentSymbolIndexesStr = escapeHtml(JSON.stringify(currentSymbolTemplateIndexes));
            const configStr = escapeHtml(JSON.stringify(cachedConfig || mergeConfig(DEFAULT_CONFIG)));
            const serializeElapsedMs = elapsedMs(serializeStartedAt);
            const currentFilePath = escapeHtml(rawCurrentFilePath);
            const source = String(state.src || '');
            const renderSignature = escapeHtml(`${source.length}:${cheapHash(source)}`);
            const tooltipStats = tooltipRenderStats(state.src || '', cachedLabels || {});
            const runtimeTooltipStats = getRuntimeTooltipStats(state.env);
            const hoverIgnoredByConfig = shouldIgnorePreviewHover(rawCurrentFilePath, cachedConfig);
            state.env.ignoreFormalTooltips = !shouldEagerRenderTooltips(rawCurrentFilePath, cachedConfig);
            const ignoreReason = hoverIgnoredByConfig ? 'config' : 'none';
            appendPreviewDebugLog(rootPath, cachedConfig, 'render:inject:data', {
                filePath: rawCurrentFilePath || '(unknown)',
                labels: Object.keys(cachedLabels || {}).length,
                pages: (cachedPages || []).length,
                definitions: (cachedDefinitions || []).length,
                symbols: (cachedSymbols || []).length,
                clientLabelsChars: objectChars(clientLabelData),
                clientDefinitionsChars: objectChars(clientDefinitionData),
                symbolsChars: objectChars(cachedSymbols || []),
                currentSymbolIndexesChars: objectChars(currentSymbolTemplateIndexes),
                hoverIgnored: state.env.ignoreFormalTooltips,
                ignoreReason,
                symbolMatchElapsedMs,
                serializeElapsedMs,
                elapsedMs: elapsedMs(dataStartedAt),
                tooltipGeneratedCount: runtimeTooltipStats.generatedCount,
                tooltipCacheHits: runtimeTooltipStats.cacheHits,
                tooltipRenderMs: runtimeTooltipStats.renderMs,
                tooltipHtmlChars: runtimeTooltipStats.htmlChars,
                ...tooltipStats
            });
            if (state.env.ignoreFormalTooltips) {
                console.warn('[math-workspace] Skipped inline ref tooltips for configured preview', {
                    filePath: rawCurrentFilePath || '(unknown)',
                    reason: ignoreReason,
                    ...tooltipStats
                });
            }

            const templatesStartedAt = Date.now();
            const currentDefinitionTemplateIndexes = definitionTemplateIndexesForFile(cachedDefinitions || [], rawCurrentFilePath);
            const definitionTemplates = renderDefinitionTemplates(md, cachedDefinitions || [], state.env || {}, currentDefinitionTemplateIndexes);
            const symbolTemplates = renderSymbolTemplates(md, cachedSymbols || [], state.env || {}, currentSymbolTemplateIndexSet);
            const titleTemplates = renderTitleTemplates(md, clientLabelData || {}, cachedPages || [], state.env || {});
            appendPreviewDebugLog(rootPath, cachedConfig, 'render:inject:templates', {
                filePath: rawCurrentFilePath || '(unknown)',
                definitionTemplateChars: definitionTemplates.length,
                definitionTemplateCount: currentDefinitionTemplateIndexes.size,
                symbolTemplateChars: symbolTemplates.length,
                symbolTemplateCount: currentSymbolTemplateIndexes.length,
                titleTemplateChars: titleTemplates.length,
                elapsedMs: elapsedMs(templatesStartedAt)
            });

            token.content = `<div id="formal-render-data" style="display:none;" data-render-signature="${renderSignature}"></div>\n<div id="formal-labels-data" style="display:none;" data-labels="${dataStr}"></div>\n<div id="formal-pages-data" style="display:none;" data-pages="${pagesStr}" data-current-file="${currentFilePath}"></div>\n<div id="formal-definitions-data" style="display:none;" data-definitions="${definitionsStr}"></div>\n<div id="formal-symbols-data" style="display:none;" data-symbols="${symbolsStr}" data-current-symbol-indexes="${currentSymbolIndexesStr}"></div>\n<div id="formal-definition-templates" style="display:none;">${definitionTemplates}</div>\n<div id="formal-symbol-templates" style="display:none;">${symbolTemplates}</div>\n<div id="formal-title-templates" style="display:none;">${titleTemplates}</div>\n<div id="formal-config-data" style="display:none;" data-config="${configStr}"></div>\n`;
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
        if (!canUseFormalPreview(state.env)) return;
        const startedAt = Date.now();
        const currentFilePath = normalizePreviewFilePath(getCurrentFilePath(rootPath, state.env, state.src || '', cachedPages || []));
        let inlineCount = 0;
        let parsedMarkerCount = 0;
        let replacedMarkerCount = 0;
        const missingMarkerLabels: string[] = [];
        const markerTraceIds = new Set<string>((Array.isArray(cachedConfig?.debug?.markerTraceIds) ? cachedConfig.debug.markerTraceIds : [])
            .filter((item: unknown): item is string => typeof item === 'string'));
        try {
            appendPreviewDebugLog(rootPath, cachedConfig, 'render:markers:start', {
                filePath: currentFilePath || '(unknown)',
                tokenCount: Array.isArray(state.tokens) ? state.tokens.length : undefined
            });
            addSourceLineAttributes(state.tokens);
            for (let i = 0; i < state.tokens.length; i++) {
                if (state.tokens[i].type === 'inline') {
                    inlineCount++;
                    const beforeContent = String(state.tokens[i].content || '');
                    const beforeChildren = inlineChildrenSnapshot(state.tokens[i]);
                    const result = applyLightweightMarker(state.tokens, i, cachedLabels || {}, cachedDefinitions || [], currentFilePath, cachedConfig);
                    if (result.parsed) parsedMarkerCount++;
                    if (result.replaced) replacedMarkerCount++;
                    if (result.missingLabel) missingMarkerLabels.push(result.missingLabel);
                    const tracedId = [...markerTraceIds].find(id => beforeContent.includes(id));
                    if (tracedId) {
                        appendPreviewDebugLog(rootPath, cachedConfig, 'render:marker:trace', {
                            filePath: currentFilePath || '(unknown)',
                            id: tracedId,
                            tokenIndex: i,
                            parsed: result.parsed,
                            replaced: result.replaced,
                            missingLabel: result.missingLabel,
                            beforeContent,
                            afterContent: String(state.tokens[i].content || ''),
                            beforeChildren,
                            afterChildren: inlineChildrenSnapshot(state.tokens[i])
                        });
                    }
                }
            }
            appendPreviewDebugLog(rootPath, cachedConfig, 'render:markers:end', {
                filePath: currentFilePath || '(unknown)',
                tokenCount: Array.isArray(state.tokens) ? state.tokens.length : undefined,
                inlineCount,
                parsedMarkerCount,
                replacedMarkerCount,
                missingMarkerLabels: missingMarkerLabels.slice(0, 12),
                missingMarkerLabelCount: missingMarkerLabels.length,
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

    // Inline rules for @h-... object refs and @chapter:/@page: page refs.
    md.inline.ruler.before('link', 'formal_inline', (state: any, silent: boolean) => {
        if (!canUseFormalPreview(state.env)) return false;
        if (state.env) state.env.formalInlineRuleCalls = (state.env.formalInlineRuleCalls || 0) + 1;
        const start = state.pos;
        if (state.src.charCodeAt(start) !== 0x40 /* @ */) return false;

        const pageMatch = state.src.slice(start).match(/^@(chapter|page):([^\s<>"'`，。；;！？]+?\.md)(?:\.(title|full))?(?=$|[\s,，。；;:：.!！?？)\]}])/);
        if (pageMatch) {
            if (silent) return false;

            const currentFilePath = normalizePreviewFilePath(state.env?.formalCurrentFilePath || getCurrentFilePath(rootPath, state.env, state.src || '', cachedPages || []));
            const token = state.push('formal_page_ref', '', 0);
            token.meta = {
                kind: pageMatch[1],
                rawTarget: pageMatch[2],
                target: normalizeFormalPagePath(pageMatch[2], currentFilePath),
                mode: pageMatch[3]
            };
            if (state.env) state.env.formalInlineMatches = (state.env.formalInlineMatches || 0) + 1;
            state.pos += pageMatch[0].length;
            return true;
        }

        const match = state.src.slice(start).match(/^@([a-zA-Z0-9_-]+)(?:\.(title|full))?/);
        if (!match) return false;
        if (state.src[start + match[0].length] === ':') return false;
        
        // Silent mode is used while markdown-it scans link labels like [@h-...].
        // Returning true without consuming text can stall that scanner.
        if (silent) return false;
        
        const id = match[1];
        const mode = (match[2] || 'default') as FormalInlineMode;
        if (state.env) state.env.formalInlineMatches = (state.env.formalInlineMatches || 0) + 1;
        
        const token = state.push('formal_inline', '', 0);
        token.meta = { id, mode };
        
        state.pos += match[0].length;
        return true;
    });

    // Auto-trim spaces around formal_inline when adjacent to Chinese characters
    md.core.ruler.after('inline', 'formal_trim_cjk_spaces', (state: any) => {
        if (state.env && state.env.tooltipDepth) return;
        if (!canUseFormalPreview(state.env)) return;
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
                    if (children[i].type === 'formal_inline' || children[i].type === 'formal_page_ref') {
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
        const { id } = token.meta;
        const mode = (token.meta?.mode || 'default') as FormalInlineMode;
        if (!canUseFormalPreview(env)) {
            return `@${escapeHtml(id)}${mode !== 'default' ? `.${escapeHtml(mode)}` : ''}`;
        }
        const labels = cachedLabels || {};
        env.formalInlineRenderCalls = (env.formalInlineRenderCalls || 0) + 1;
        if (env.formalInlineRenderCalls === 1 || env.formalInlineRenderCalls % 25 === 0) {
            appendPreviewDebugLog(rootPath, cachedConfig, 'render:inline-render:progress', {
                filePath: getCurrentFilePath(rootPath, env, '', cachedPages || []) || '(unknown)',
                calls: env.formalInlineRenderCalls,
                id,
                mode
            });
        }
        const labelData = labels[id];
        
        if (!labelData) {
            return `<span style="color:red; font-weight:bold">@${escapeHtml(id)}</span>`;
        }

        if (isPageLabelData(labelData)) {
            const page = pageDataFromLabel(labelData);
            const displayMode = mode === 'title' || mode === 'full' ? mode : 'default';
            const text = formatPageReference(page, cachedConfig, displayMode);
            const titleAttr = formatPageReference(page, cachedConfig, 'full');
            const uri = normalizeFileHref(rootPath, labelData.filePath || '', id);
            const targetLineAttr = labelData.startLine !== undefined ? ` data-target-line="${labelData.startLine + 1}"` : '';
            return `<a class="formal-ref formal-page-ref" href="${escapeHtml(uri)}" data-href="${escapeHtml(uri)}"${targetLineAttr} title="${escapeHtml(titleAttr)}" style="color: inherit; text-decoration: none;">${escapeHtml(text)}</a>`;
        }
        
        const dict = getDictionary(cachedConfig);
        const typeName = dict[labelData.type] || labelData.type;
        const space = usesSpacedDisplayNumber(typeName, labelData.type) ? ' ' : '';
        
        let text = '';
        if (mode === 'title') {
            text = labelData.title || id;
        } else if (mode === 'full') {
            const labelNumber = formatDisplayNumber(labelData);
            const base = labelNumber ? `${typeName}${space}${labelNumber}` : typeName;
            if (labelData.title) {
                const open = getLanguage(cachedConfig) === 'en' ? ' (' : '（';
                const close = getLanguage(cachedConfig) === 'en' ? ')' : '）';
                text = `${base}${open}${labelData.title}${close}`;
            } else {
                text = base;
            }
        } else {
            const labelNumber = formatDisplayNumber(labelData);
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
            const runtimeTooltipStats = getRuntimeTooltipStats(env);
            
            if (env.formalTooltipCache[id] !== undefined) {
                runtimeTooltipStats.cacheHits++;
                tooltipHtml = env.formalTooltipCache[id];
            } else {
                // Re-render the captured content using the same md instance
                const tooltipStartedAt = Date.now();
                const renderedContent = md.render(labelData.content, {
                    ...env,
                    tooltipDepth: 1,
                    formalTooltipCache: env.formalTooltipCache
                });
                runtimeTooltipStats.renderMs += elapsedMs(tooltipStartedAt);
                const safeHtml = inlineSafeRenderedMarkdown(renderedContent);
                    
                let headerTextTooltip = typeName;
                if (labelData.type === 'section') {
                    headerTextTooltip = '';
                    headerTextTooltip = formatLabelNumber(labelData);
                    if (labelData.title) headerTextTooltip += (headerTextTooltip ? ' ' : '') + labelData.title;
                } else {
                    const labelNumber = formatDisplayNumber(labelData);
                    if (labelNumber) headerTextTooltip += `${space}${labelNumber}`;
                    if (labelData.title) headerTextTooltip += ` (${labelData.title})`;
                }
                const colon = getColon(cachedConfig);
                const headerHtml = `<span class="formal-tooltip-header">${escapeHtml(headerTextTooltip)}${colon}</span>`;
                
                tooltipHtml = `<span class="formal-tooltip">${headerHtml}${safeHtml}</span>`;
                env.formalTooltipCache[id] = tooltipHtml;
                runtimeTooltipStats.generatedCount++;
                runtimeTooltipStats.contentChars += String(labelData.content || '').length;
                runtimeTooltipStats.htmlChars += tooltipHtml.length;
            }
        }
        
        const titleAttr = typeName + (labelData.title ? getColon(cachedConfig) + labelData.title : '');
        return `<span class="formal-ref-wrap"><a class="formal-ref" href="${escapeHtml(uri)}" data-href="${escapeHtml(uri)}"${targetLineAttr} title="${escapeHtml(titleAttr)}" style="color: inherit; text-decoration: none;">${escapeHtml(text)}</a>${tooltipHtml}</span>`;
    };

    md.renderer.rules.formal_page_ref = (tokens: any, idx: number, options: any, env: any) => {
        const token = tokens[idx];
        const { kind, rawTarget, target, mode } = token.meta;
        if (!canUseFormalPreview(env)) {
            return `@${escapeHtml(kind)}:${escapeHtml(rawTarget)}${mode ? `.${escapeHtml(mode)}` : ''}`;
        }
        const page = (cachedPages || []).find(item => normalizePreviewFilePath(item.filePath) === normalizePreviewFilePath(target));

        if (!page) {
            return `<span style="color:red; font-weight:bold">@${escapeHtml(kind)}:${escapeHtml(rawTarget)}</span>`;
        }

        if (kind === 'chapter' && page.kind !== 'chapter') {
            return `<span style="color:red; font-weight:bold">@chapter:${escapeHtml(rawTarget)}</span>`;
        }

        const displayMode = mode === 'title' || mode === 'full' ? mode : 'default';
        const text = formatPageReference(page, cachedConfig, displayMode);
        const titleAttr = formatPageReference(page, cachedConfig, 'full');
        const uri = normalizePageHref(page.filePath || '');
        return `<a class="formal-page-ref" href="${escapeHtml(uri)}" data-href="${escapeHtml(uri)}" title="${escapeHtml(titleAttr)}" style="color: inherit; text-decoration: none;">${escapeHtml(text)}</a>`;
    };
}

export default formalPlugin;
