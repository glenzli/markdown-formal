import * as fs from 'fs';
import * as path from 'path';

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
    contentPreview?: string;
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

function getLanguage(config: any): 'zh' | 'en' {
    return config && config.language === 'en' ? 'en' : 'zh';
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

export = function formalPlugin(md: any, options: any) {
    const rootPath = options ? options.rootPath : '';
    let cachedLabels: Record<string, LabelData> = {};
    let cachedPages: PageData[] = [];
    let cachedConfig: any = mergeConfig(DEFAULT_CONFIG);
    
    // Core rule to load labels ONCE per render
    md.core.ruler.before('normalize', 'formal_load_labels', (state: any) => {
        if (!rootPath) return;
        const cachePath = path.join(rootPath, '.markdown-formal', 'labels.json');
        try {
            if (fs && fs.existsSync && fs.existsSync(cachePath)) {
                const data = fs.readFileSync(cachePath, 'utf-8');
                cachedLabels = JSON.parse(data);
                state.env.labels = cachedLabels;
            } else {
                cachedLabels = {};
            }
        } catch (e: any) {
            console.error('[markdown-formal] Failed to load labels.json:', e);
            cachedLabels = {};
        }

        const pagesPath = path.join(rootPath, '.markdown-formal', 'pages.json');
        try {
            if (fs && fs.existsSync && fs.existsSync(pagesPath)) {
                cachedPages = JSON.parse(fs.readFileSync(pagesPath, 'utf-8'));
                state.env.pages = cachedPages;
            } else {
                cachedPages = [];
            }
        } catch (e: any) {
            console.error('[markdown-formal] Failed to load pages.json:', e);
            cachedPages = [];
        }
        
        const configPath = path.join(rootPath, '.markdown-formal', 'config.json');
        try {
            if (fs && fs.existsSync && fs.existsSync(configPath)) {
                cachedConfig = mergeConfig(JSON.parse(fs.readFileSync(configPath, 'utf-8')));
            } else {
                cachedConfig = mergeConfig(DEFAULT_CONFIG);
            }
        } catch(e) {
            cachedConfig = mergeConfig(DEFAULT_CONFIG);
        }
    });

    // Inject labels data at the end of the document for frontend JS
    md.core.ruler.push('formal_inject_data', (state: any) => {
        if (state.env && state.env.tooltipDepth) return;
        
        const token = new state.Token('html_block', '', 0);
        const dataStr = escapeHtml(JSON.stringify(cachedLabels || {}));
        const pagesStr = escapeHtml(JSON.stringify(cachedPages || []));
        const configStr = escapeHtml(JSON.stringify(cachedConfig || mergeConfig(DEFAULT_CONFIG)));
        const currentFilePath = escapeHtml(getCurrentFilePathFromEnv(rootPath, state.env));
        token.content = `<div id="formal-labels-data" style="display:none;" data-labels="${dataStr}"></div>\n<div id="formal-pages-data" style="display:none;" data-pages="${pagesStr}" data-current-file="${currentFilePath}"></div>\n<div id="formal-config-data" style="display:none;" data-config="${configStr}"></div>\n`;
        state.tokens.push(token);
    });

    // Block rule for :::prop {#id title="title"}
    md.block.ruler.before('fence', 'formal_block', (state: any, startLine: number, endLine: number, silent: boolean) => {
        const start = state.bMarks[startLine] + state.tShift[startLine];
        const max = state.eMarks[startLine];
        const lineText = state.src.slice(start, max);
        
        const match = lineText.match(/^:::(prop|lemma|theorem|cor|def|remark|example|section)\s+\{([^}]+)\}\s*$/);
        if (!match) return false;

        if (silent) return true;
        
        // Find closing :::
        let nextLine = startLine + 1;
        let hasClosing = false;
        while (nextLine < endLine) {
            const nextStart = state.bMarks[nextLine] + state.tShift[nextLine];
            const nextMax = state.eMarks[nextLine];
            const nextLineText = state.src.slice(nextStart, nextMax);
            if (nextLineText.trim() === ':::') {
                hasClosing = true;
                break;
            }
            nextLine++;
        }
        
        if (!hasClosing) return false;
        
        const type = match[1];
        const inner = match[2];
        const idMatch = inner.match(/#([^\s]+)/);
        const titleMatch = inner.match(/title="([^"]*)"/);
        
        const id = idMatch ? idMatch[1] : '';
        const title = titleMatch ? titleMatch[1] : '';
        
        const old_parent = state.parentType;
        const old_line_max = state.lineMax;
        state.parentType = 'container';
        state.lineMax = nextLine;
        
        const tokenStart = state.push('formal_block_open', 'div', 1);
        tokenStart.block = true;
        tokenStart.map = [startLine, nextLine];
        tokenStart.meta = { type, id, title };
        
        state.md.block.tokenize(state, startLine + 1, nextLine);
        
        const tokenEnd = state.push('formal_block_close', 'div', -1);
        tokenEnd.block = true;
        
        state.parentType = old_parent;
        state.lineMax = old_line_max;
        state.line = nextLine + 1;
        return true;
    });

    // Renderer for formal_block
    md.renderer.rules.formal_block_open = (tokens: any, idx: number, options: any, env: any, self: any) => {
        const token = tokens[idx];
        const { type, id, title } = token.meta;
        
        const labels = cachedLabels || {};
        const labelData = (labels[id] || { type, title, filePath: '' }) as LabelData;
        
        const dict = getDictionary(cachedConfig);
        const typeName = dict[labelData.type] || labelData.type;
        const space = /^[A-Za-z]/.test(typeName) ? ' ' : '';
        
        let headerText = typeName;
        
        const lineAttr = token.map ? ` data-line="${token.map[0]}" dir="auto"` : '';
        
        if (type === 'section') {
            headerText = '';
            headerText = formatLabelNumber(labelData);
            if (labelData.title) {
                headerText += (headerText ? ' ' : '') + labelData.title;
            }
            return `<h2 id="formal-${escapeHtml(id)}"${lineAttr} class="formal-section" style="margin-top: 1.5em; margin-bottom: 0.5em;">${escapeHtml(headerText)}</h2>\n<div class="formal-section-body">`;
        }
        
        const labelNumber = formatLabelNumber(labelData);
        if (labelNumber) {
            headerText += `${space}${labelNumber}`;
        }
        if (labelData.title) {
            headerText += ` (${labelData.title})`;
        }
        
        const colon = getColon(cachedConfig);
        
        // Inject inline style to the immediate paragraph so it stays on the same line
        if (tokens[idx + 1] && tokens[idx + 1].type === 'paragraph_open') {
            const pToken = tokens[idx + 1];
            pToken.attrs = pToken.attrs || [];
            const styleIndex = pToken.attrs.findIndex((a: any) => a[0] === 'style');
            if (styleIndex < 0) {
                pToken.attrs.push(['style', 'display: inline; margin: 0;']);
            } else {
                pToken.attrs[styleIndex][1] += ' display: inline; margin: 0;';
            }
        }
        
        // A minimal neutral styling, removing colored quote box
        return `<div id="formal-${escapeHtml(id)}"${lineAttr} class="formal-block formal-${escapeHtml(type)}" style="margin: 1em 0;">
<strong>${escapeHtml(headerText)}${colon}</strong>`;
    };

    md.renderer.rules.formal_block_close = () => {
        return `</div>\n`;
    };

    // Inline rule for @p-123 and @p-123.title
    md.inline.ruler.before('link', 'formal_inline', (state: any, silent: boolean) => {
        const start = state.pos;
        if (state.src.charCodeAt(start) !== 0x40 /* @ */) return false;
        
        const match = state.src.slice(start).match(/^@([a-zA-Z0-9_-]+)(\.title)?/);
        if (!match) return false;
        
        if (silent) return true;
        
        const id = match[1];
        const isTitle = !!match[2];
        
        const token = state.push('formal_inline', '', 0);
        token.meta = { id, isTitle };
        
        state.pos += match[0].length;
        return true;
    });

    // Auto-trim spaces around formal_inline when adjacent to Chinese characters
    md.core.ruler.after('inline', 'formal_trim_cjk_spaces', (state: any) => {
        for (const blkToken of state.tokens) {
            if (blkToken.type !== 'inline') continue;
            const children = blkToken.children;
            if (!children) continue;
            
            for (let i = 0; i < children.length; i++) {
                if (children[i].type === 'formal_inline') {
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
    });

    // Renderer for formal_inline
    md.renderer.rules.formal_inline = (tokens: any, idx: number, options: any, env: any, self: any) => {
        const token = tokens[idx];
        const { id, isTitle } = token.meta;
        const labels = cachedLabels || {};
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
        if (labelData.content && (env.tooltipDepth || 0) === 0) {
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
