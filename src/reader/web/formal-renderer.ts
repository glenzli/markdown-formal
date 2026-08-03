import MarkdownIt from 'markdown-it';
import katex from 'katex';
import type { ReaderDependencyMarker } from '../dependency-markers';

export interface ReaderLabel {
    type: string;
    title: string;
    filePath: string;
    display?: string;
    number?: number;
}

export interface ReaderPage {
    id?: string;
    kind: string;
    filePath: string;
    title: string;
    displayHeading?: string;
    displayReference?: string;
    chapter?: number;
    appendix?: string;
    line?: number;
}

export type { ReaderDependencyMarker } from '../dependency-markers';

export interface FormalRenderOptions {
    currentFilePath: string;
    labels: Record<string, ReaderLabel>;
    pages: ReaderPage[];
    language: 'zh' | 'en';
    dependencyMarkers?: Record<string, ReaderDependencyMarker>;
}

export interface ReaderFormula {
    id: string;
    latex: string;
    source: string;
    display: boolean;
    sourceStartLine?: number;
    sourceEndLine?: number;
}

export interface RenderedFormalDocument {
    html: string;
    formulas: ReaderFormula[];
}

interface MathTokenMeta {
    display: boolean;
    source: string;
    sourceStartLine?: number;
    sourceEndLine?: number;
}

export function renderReaderFormula(formula: Pick<ReaderFormula, 'latex' | 'display'>): string {
    return katex.renderToString(formula.latex, {
        displayMode: formula.display,
        throwOnError: false,
        strict: 'ignore',
        trust: false
    });
}

function escapeHtml(value: string): string {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function dependencyMarkerText(marker: ReaderDependencyMarker, language: 'zh' | 'en'): string {
    const dependencies = Math.max(0, marker.directDependencies || 0);
    const dependents = Math.max(0, marker.directDependents || 0);
    const impact = Math.max(0, marker.impactCount || 0);
    const otherReferences = Math.max(0, (marker.sourceReferenceCount || 0) - dependencies);
    if (language === 'en') {
        const upstream = dependencies > 0 ? `${dependencies} upstream dependency node${dependencies === 1 ? '' : 's'}` : 'no upstream dependency nodes';
        const supplemental = otherReferences > 0 ? `; ${otherReferences} other formal reference${otherReferences === 1 ? '' : 's'}` : '';
        if (dependents === 0) return `${upstream}; no downstream dependency nodes${supplemental}`;
        return `${upstream}; ${dependents} direct downstream node${dependents === 1 ? '' : 's'}; downstream impact ${impact}${supplemental}`;
    }
    const upstream = dependencies > 0 ? `上游依赖对象 ${dependencies} 项` : '没有上游依赖对象';
    const supplemental = otherReferences > 0 ? `；另引用 ${otherReferences} 项章节、定义或其他 formal 对象` : '';
    if (dependents === 0) return `${upstream}；没有下游依赖对象${supplemental}`;
    return `${upstream}；下游依赖对象 ${dependents} 项；传递影响 ${impact} 项${supplemental}`;
}

function renderDependencyMarker(id: string, marker: ReaderDependencyMarker, language: 'zh' | 'en'): string {
    const hasInput = marker.directDependencies > 0;
    const hasOutput = marker.directDependents > 0;
    const outputPath = !hasOutput ? '' : marker.directDependents > 1
        ? '<path d="M8 12.35v2.15m0 0L4.4 18m3.6-3.5 3.6 3.5" />'
        : '<path d="M8 12.35v6.15" />';
    const svg = [
        '<svg viewBox="0 0 16 20" aria-hidden="true" focusable="false">',
        hasInput ? '<path d="M8 1.5v6.15" />' : '',
        '<circle cx="8" cy="10" r="2.35" />',
        outputPath,
        '</svg>'
    ].join('');
    const label = dependencyMarkerText(marker, language);
    const intensity = marker.impactCount > marker.directDependents ? ' is-propagating' : '';
    return '<button type="button" class="reader-dependency-marker is-' + marker.role + ' is-' + marker.kind + intensity
        + '" aria-label="' + escapeHtml(label) + '" data-reader-dependency="' + escapeHtml(id) + '">'
        + svg + '</button>';
}

function hasOddBackslashPrefix(value: string, index: number): boolean {
    let count = 0;
    for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor--) count++;
    return count % 2 === 1;
}

function findInlineDollarEnd(value: string, start: number): number {
    for (let cursor = start; cursor < value.length; cursor++) {
        if (value[cursor] === '$' && value[cursor + 1] !== '$' && !hasOddBackslashPrefix(value, cursor)) return cursor;
    }
    return -1;
}

function installMathRules(markdown: MarkdownIt): void {
    markdown.block.ruler.before('fence', 'formal_math_block', (state: any, startLine: number, endLine: number, silent: boolean) => {
        const start = state.bMarks[startLine] + state.tShift[startLine];
        const line = state.src.slice(start, state.eMarks[startLine]).trim();
        const singleLineDollar = line.match(/^\$\$([\s\S]*?)\$\$$/);
        const singleLineBracket = line.match(/^\\\[([\s\S]*?)\\\]$/);
        const singleLineContent = singleLineDollar?.[1] ?? singleLineBracket?.[1];
        if (singleLineContent !== undefined) {
            if (silent) return true;
            const token = state.push('formal_math_block', 'math', 0);
            token.block = true;
            token.content = singleLineContent.trim();
            token.map = [startLine, startLine + 1];
            token.meta = {
                display: true,
                source: line,
                sourceStartLine: startLine + 1,
                sourceEndLine: startLine + 1
            } satisfies MathTokenMeta;
            state.line = startLine + 1;
            return true;
        }

        const delimiter = line.startsWith('$$') ? '$$' : line.startsWith('\\[') ? '\\[' : '';
        if (!delimiter) return false;

        const closeDelimiter = delimiter === '$$' ? '$$' : '\\]';
        const openingContent = line.slice(delimiter.length);
        let nextLine = startLine + 1;
        while (nextLine < endLine) {
            const nextStart = state.bMarks[nextLine] + state.tShift[nextLine];
            const candidate = state.src.slice(nextStart, state.eMarks[nextLine]).trim();
            if (candidate === closeDelimiter || candidate.endsWith(closeDelimiter)) break;
            nextLine++;
        }
        if (nextLine >= endLine) return false;
        if (silent) return true;

        const closingStart = state.bMarks[nextLine] + state.tShift[nextLine];
        const closingLine = state.src.slice(closingStart, state.eMarks[nextLine]).trim();
        const closingContent = closingLine === closeDelimiter
            ? ''
            : closingLine.slice(0, -closeDelimiter.length);
        const middleContent = state.getLines(startLine + 1, nextLine, state.blkIndent, false);

        const token = state.push('formal_math_block', 'math', 0);
        token.block = true;
        token.content = [openingContent, middleContent, closingContent].filter(Boolean).join('\n').trim();
        token.map = [startLine, nextLine + 1];
        token.meta = {
            display: true,
            source: state.getLines(startLine, nextLine + 1, state.blkIndent, false).trim(),
            sourceStartLine: startLine + 1,
            sourceEndLine: nextLine + 1
        } satisfies MathTokenMeta;
        state.line = nextLine + 1;
        return true;
    }, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });

    markdown.inline.ruler.before('escape', 'formal_math_inline', (state: any, silent: boolean) => {
        const start = state.pos;
        const source = state.src;
        let close = -1;
        let offset = 0;

        if (source[start] === '\\' && source[start + 1] === '(' && !hasOddBackslashPrefix(source, start)) {
            close = source.indexOf('\\)', start + 2);
            offset = 2;
        } else if (
            source[start] === '$'
            && source[start + 1] !== '$'
            && !hasOddBackslashPrefix(source, start)
            && !/\s/.test(source[start + 1] || '')
        ) {
            close = findInlineDollarEnd(source, start + 1);
            offset = 1;
        } else {
            return false;
        }

        if (close < 0 || close <= start + offset || /\s$/.test(source.slice(start + offset, close))) return false;
        if (!silent) {
            const token = state.push('formal_math_inline', 'math', 0);
            token.content = source.slice(start + offset, close);
            token.meta = {
                display: false,
                source: source.slice(start, close + offset)
            } satisfies MathTokenMeta;
        }
        state.pos = close + offset;
        return true;
    });

    const renderMath = (tokens: any[], index: number, env: any, display: boolean) => {
        const token = tokens[index];
        const metadata = (token.meta || {}) as Partial<MathTokenMeta>;
        const rendered = renderReaderFormula({ latex: token.content, display });
        const formulas = env.readerFormulas as ReaderFormula[] | undefined;
        if (!formulas) return rendered;
        const formula: ReaderFormula = {
            id: 'formula-' + formulas.length,
            latex: token.content,
            source: metadata.source || token.content,
            display,
            sourceStartLine: metadata.sourceStartLine,
            sourceEndLine: metadata.sourceEndLine
        };
        formulas.push(formula);
        return '<span class="reader-formula' + (display ? ' is-display' : '') + '" data-reader-formula="' + formula.id + '">' + rendered + '</span>';
    };
    markdown.renderer.rules.formal_math_block = (tokens: any[], index: number, _options: any, env: any) => renderMath(tokens, index, env, true);
    markdown.renderer.rules.formal_math_inline = (tokens: any[], index: number, _options: any, env: any) => renderMath(tokens, index, env, false);
}

function normalizePath(value: string): string {
    const parts: string[] = [];
    value.replace(/\\/g, '/').split('/').forEach(part => {
        if (!part || part === '.') return;
        if (part === '..') {
            parts.pop();
            return;
        }
        parts.push(part);
    });
    return parts.join('/');
}

function resolveReaderPath(target: string, currentFilePath: string): string {
    const clean = target.split('#', 1)[0].replace(/^\/+/, '');
    if (!/^\.{1,2}\//.test(clean)) return normalizePath(clean);
    const directory = currentFilePath.includes('/') ? currentFilePath.slice(0, currentFilePath.lastIndexOf('/')) : '';
    return normalizePath(directory + '/' + clean);
}

function makePageHref(filePath: string, targetId = ''): string {
    return '?path=' + encodeURIComponent(filePath) + (targetId ? '#formal-' + encodeURIComponent(targetId) : '');
}

function formatPageReference(page: ReaderPage, mode: 'title' | 'full' | undefined, language: 'zh' | 'en'): string {
    const label = page.displayReference || page.title;
    if (mode === 'title') return page.title;
    if (mode === 'full' && page.title && label !== page.title) {
        return label + (language === 'en' ? ': ' : '：') + page.title;
    }
    return label;
}

function prepareFormalMarkdown(source: string, options: FormalRenderOptions): { source: string; markersByLine: Record<number, string> } {
    const markersByLine: Record<number, string> = {};
    const pagesByPath = new Map(options.pages.map(page => [page.filePath, page]));
    const markerTypeRe = /(命题|引理|定理|推论|注|例|公式|图|表|Proposition|Lemma|Theorem|Corollary|Remark|Example|Equation|Figure|Table)\s*$/i;
    let inFence = false;

    const lines = source.split(/\r?\n/).map((line, lineIndex) => {
        if (/^\s*(\\x60{3}|~~~)/.test(line)) {
            inFence = !inFence;
            return line;
        }
        if (inFence) return line;

        const heading = line.match(/^(\s{0,3}#{1,6})\s+#([A-Za-z0-9_-]+)\s*(.*)$/);
        if (heading) {
            const label = options.labels[heading[2]];
            if (label) {
                markersByLine[lineIndex] = heading[2];
                const page = pagesByPath.get(label.filePath);
                const isPageAnchor = ['chapter', 'appendix', 'intro', 'summary'].includes(label.type);
                const headingText = isPageAnchor
                    ? (page?.displayHeading || heading[3] || label.title)
                    : [label.display, heading[3] || label.title].filter(Boolean).join(' ');
                return heading[1] + ' ' + headingText;
            }
        }

        const idMatch = line.match(/#([A-Za-z0-9_-]+)\b/);
        if (!idMatch || idMatch.index === undefined) return line;
        const label = options.labels[idMatch[1]];
        if (!label) return line;
        markersByLine[lineIndex] = idMatch[1];

        const before = line.slice(0, idMatch.index);
        const typeMatch = before.match(markerTypeRe);
        if (!typeMatch || typeMatch.index === undefined) {
            return before + (label.display || label.title) + line.slice(idMatch.index + idMatch[0].length);
        }
        const display = label.display || (typeMatch[1] + ' ' + String(label.number || '')).trim();
        return before.slice(0, typeMatch.index) + display + line.slice(idMatch.index + idMatch[0].length);
    });

    return { source: lines.join('\n'), markersByLine };
}

function installFormalRules(markdown: MarkdownIt): void {
    markdown.inline.ruler.before('text', 'formal_reference', (state: any, silent: boolean) => {
        const match = state.src.slice(state.pos).match(/^@([A-Za-z0-9_-]+)(?:\.(title|full))?\b(?!:)/);
        if (!match) return false;
        const label = state.env.readerLabels?.[match[1]];
        if (!label) return false;
        if (!silent) {
            const token = state.push('formal_reference', '', 0);
            token.meta = { id: match[1], mode: match[2] };
        }
        state.pos += match[0].length;
        return true;
    });

    markdown.inline.ruler.before('text', 'formal_page_reference', (state: any, silent: boolean) => {
        const match = state.src.slice(state.pos).match(/^@(chapter|page):([^\s<>"'\x60，。；;！？]+?\.md)(?:\.(title|full))?(?=$|[\s,，。；;:：.!！?？)\]}])/);
        if (!match) return false;
        const filePath = resolveReaderPath(match[2], state.env.readerCurrentFilePath || '');
        const page = state.env.readerPagesByPath?.[filePath];
        if (!page) return false;
        if (!silent) {
            const token = state.push('formal_page_reference', '', 0);
            token.meta = { filePath, mode: match[3] };
        }
        state.pos += match[0].length;
        return true;
    });

    markdown.renderer.rules.formal_reference = (tokens: any[], index: number, _options: any, env: any) => {
        const meta = tokens[index].meta;
        const label = env.readerLabels[meta.id] as ReaderLabel;
        const display = meta.mode === 'title'
            ? label.title
            : meta.mode === 'full' && label.title
                ? (label.display || label.type) + (env.readerLanguage === 'en' ? ': ' : '：') + label.title
                : label.display || label.title;
        return '<a class="formal-reference" data-formal-ref="' + escapeHtml(meta.id) + '" data-reader-page="' + escapeHtml(label.filePath) + '" href="' + makePageHref(label.filePath, meta.id) + '">' + escapeHtml(display) + '</a>';
    };
    markdown.renderer.rules.formal_page_reference = (tokens: any[], index: number, _options: any, env: any) => {
        const meta = tokens[index].meta;
        const page = env.readerPagesByPath[meta.filePath] as ReaderPage;
        return '<a class="formal-page-reference" data-reader-page="' + escapeHtml(meta.filePath) + '" href="' + makePageHref(meta.filePath) + '">' + escapeHtml(formatPageReference(page, meta.mode, env.readerLanguage)) + '</a>';
    };

    markdown.core.ruler.after('inline', 'formal_reader_anchors', (state: any) => {
        const markers = state.env.readerMarkersByLine || {};
        for (let index = 0; index < state.tokens.length; index++) {
            const token = state.tokens[index];
            if (token.type !== 'inline' || !token.map) continue;
            const open = state.tokens[index - 1];
            if (!open || !open.map || open.nesting !== 1) continue;
            const line = token.map[0];
            open.attrSet('data-source-line', String(line + 1));
            open.attrSet('data-source-start-line', String(line + 1));
            open.attrSet('data-source-end-line', String(token.map[1]));
            const markerId = markers[line];
            if (!markerId) continue;
            open.attrSet('id', 'formal-' + markerId);
            open.attrJoin('class', 'formal-anchor');
            const dependencyMarker = state.env.readerDependencyMarkers?.[markerId] as ReaderDependencyMarker | undefined;
            if (dependencyMarker && Array.isArray(token.children)) {
                const markerToken = new token.constructor('html_inline', '', 0);
                markerToken.content = renderDependencyMarker(markerId, dependencyMarker, state.env.readerLanguage || 'zh');
                token.children.push(markerToken);
            }
        }
    });
}

function installWorkspaceAssetRule(markdown: MarkdownIt): void {
    const defaultImage = markdown.renderer.rules.image
        || ((tokens: any[], index: number, options: any, _env: any, self: any) => self.renderToken(tokens, index, options));
    markdown.renderer.rules.image = (tokens: any[], index: number, options: any, env: any, self: any) => {
        const token = tokens[index];
        const source = token.attrGet('src') || '';
        if (source && !/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(source)) {
            token.attrSet('src', '/api/asset?path=' + encodeURIComponent(resolveReaderPath(source, env.readerCurrentFilePath || '')));
        }
        return defaultImage(tokens, index, options, env, self);
    };
}

function installWorkspaceLinkRule(markdown: MarkdownIt): void {
    const defaultLinkOpen = markdown.renderer.rules.link_open
        || ((tokens: any[], index: number, options: any, _env: any, self: any) => self.renderToken(tokens, index, options));
    markdown.renderer.rules.link_open = (tokens: any[], index: number, options: any, env: any, self: any) => {
        const token = tokens[index];
        const href = token.attrGet('href') || '';
        if (!href || /^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(href)) {
            return defaultLinkOpen(tokens, index, options, env, self);
        }
        const hashIndex = href.indexOf('#');
        const rawPath = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
        if (!/\.md$/i.test(rawPath)) {
            return defaultLinkOpen(tokens, index, options, env, self);
        }
        const filePath = resolveReaderPath(rawPath, env.readerCurrentFilePath || '');
        const anchor = hashIndex >= 0 ? href.slice(hashIndex + 1) : '';
        token.attrSet('data-reader-page', filePath);
        token.attrSet('href', '?path=' + encodeURIComponent(filePath) + (anchor ? '#' + encodeURIComponent(anchor) : ''));
        return defaultLinkOpen(tokens, index, options, env, self);
    };
}

export function createFormalRenderer(): MarkdownIt {
    const markdown = new MarkdownIt({ html: false, linkify: false, typographer: false });
    installMathRules(markdown);
    installFormalRules(markdown);
    installWorkspaceLinkRule(markdown);
    installWorkspaceAssetRule(markdown);
    return markdown;
}

function renderEnvironment(options: FormalRenderOptions, markersByLine: Record<number, string>, formulas?: ReaderFormula[]): Record<string, unknown> {
    return {
        readerCurrentFilePath: options.currentFilePath,
        readerLabels: options.labels,
        readerPagesByPath: Object.fromEntries(options.pages.map(page => [page.filePath, page])),
        readerMarkersByLine: markersByLine,
        readerDependencyMarkers: options.dependencyMarkers || {},
        readerLanguage: options.language,
        readerFormulas: formulas
    };
}

export function renderFormalDocument(markdown: MarkdownIt, source: string, options: FormalRenderOptions): RenderedFormalDocument {
    const prepared = prepareFormalMarkdown(source, options);
    const formulas: ReaderFormula[] = [];
    return {
        html: markdown.render(prepared.source, renderEnvironment(options, prepared.markersByLine, formulas)),
        formulas
    };
}

export function renderFormalMarkdown(markdown: MarkdownIt, source: string, options: FormalRenderOptions): string {
    return renderFormalDocument(markdown, source, options).html;
}

export function renderFormalInline(markdown: MarkdownIt, source: string, options: FormalRenderOptions): string {
    return markdown.renderInline(source, renderEnvironment(options, {}));
}
