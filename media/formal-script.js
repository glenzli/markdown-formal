"use strict";
(function () {
    const formalWindow = window;
    const HISTORY_KEY = 'markdown-formal-history';
    const NAV_HASH_PREFIX = 'formal-nav-';
    const WINDOW_NAV_PREFIX = 'markdown-formal-nav:';
    const ROOT_BOOK_KEY = '__workspace__';
    const ROOT_VOLUME_KEY = '__root__';
    const DEFAULT_CONFIG = {
        language: 'zh',
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
                workspace: '工作区',
                definitionSearch: '查定义',
                definitionSearchPlaceholder: '搜索定义/符号',
                definitionSearchEmpty: '无匹配定义或符号',
                definitionContextTitle: '定义',
                definitionLocate: '定位',
                symbolContextTitle: '符号',
                symbolSource: '来源'
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
                workspace: 'Workspace',
                definitionSearch: 'Definitions',
                definitionSearchPlaceholder: 'Search definitions/symbols',
                definitionSearchEmpty: 'No matching definitions or symbols',
                definitionContextTitle: 'Definition',
                definitionLocate: 'Locate',
                symbolContextTitle: 'Symbol',
                symbolSource: 'Source'
            }
        }
    };
    let lastNavSignature = '';
    let retryCount = 0;
    let symbolRetryCount = 0;
    let appliedNavigationHash = '';
    let suppressedSelectionText = '';
    function readJson(key, fallback) {
        try {
            const value = localStorage.getItem(key);
            return value ? JSON.parse(value) : fallback;
        }
        catch (_err) {
            return fallback;
        }
    }
    function writeJson(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }
    function encodePayload(payload) {
        const encoded = encodeURIComponent(JSON.stringify(payload));
        return btoa(encoded).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    }
    function decodePayload(value) {
        try {
            const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
            const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
            return JSON.parse(decodeURIComponent(atob(padded)));
        }
        catch (_err) {
            return null;
        }
    }
    function decodePart(value) {
        try {
            return decodeURIComponent(value);
        }
        catch (_err) {
            return value;
        }
    }
    function normalizePath(filePath) {
        if (!filePath)
            return '';
        const withoutHash = filePath.split('#', 1)[0];
        const decoded = decodePart(withoutHash);
        return decoded.startsWith('/') ? decoded : `/${decoded}`;
    }
    function normalizeTargetId(hash) {
        const raw = decodePart(hash.replace(/^#/, ''));
        return raw.startsWith('formal-') ? raw : `formal-${raw}`;
    }
    function parseLocationPayload() {
        const hash = window.location.hash.replace(/^#/, '');
        if (!hash.startsWith(NAV_HASH_PREFIX))
            return null;
        return decodePayload(hash.slice(NAV_HASH_PREFIX.length));
    }
    function getLocationNavHash() {
        return window.location.hash.replace(/^#/, '').startsWith(NAV_HASH_PREFIX) ? window.location.hash : '';
    }
    function readWindowPayload() {
        if (!window.name || !window.name.startsWith(WINDOW_NAV_PREFIX))
            return null;
        const payload = decodePayload(window.name.slice(WINDOW_NAV_PREFIX.length));
        window.name = '';
        return payload;
    }
    function readIncomingPayload() {
        return readWindowPayload() || parseLocationPayload();
    }
    function splitTargetUrl(targetUrl, currentFilePath) {
        const hashIndex = targetUrl.indexOf('#');
        const rawPath = hashIndex >= 0 ? targetUrl.slice(0, hashIndex) : targetUrl;
        const rawHash = hashIndex >= 0 ? targetUrl.slice(hashIndex) : '';
        const filePath = rawPath ? normalizePath(rawPath) : currentFilePath;
        const targetId = rawHash ? normalizeTargetId(rawHash) : '';
        return { filePath, targetId };
    }
    function readLabels() {
        const dataDiv = document.getElementById('formal-labels-data');
        if (!dataDiv)
            return {};
        try {
            const raw = dataDiv.getAttribute('data-labels');
            return raw ? JSON.parse(raw) : {};
        }
        catch (err) {
            console.error('[markdown-formal] Failed to parse labels', err);
            return {};
        }
    }
    function readPages() {
        const dataDiv = document.getElementById('formal-pages-data');
        if (!dataDiv)
            return [];
        try {
            const raw = dataDiv.getAttribute('data-pages');
            return raw ? JSON.parse(raw) : [];
        }
        catch (err) {
            console.error('[markdown-formal] Failed to parse pages', err);
            return [];
        }
    }
    function readDefinitions() {
        const dataDiv = document.getElementById('formal-definitions-data');
        if (!dataDiv)
            return [];
        try {
            const raw = dataDiv.getAttribute('data-definitions');
            const definitions = raw ? JSON.parse(raw) : [];
            return Array.isArray(definitions)
                ? definitions.map((definition, index) => ({
                    ...definition,
                    index,
                    targetId: `formal-def-${index}`
                }))
                : [];
        }
        catch (err) {
            console.error('[markdown-formal] Failed to parse definitions', err);
            return [];
        }
    }
    function readSymbols() {
        const dataDiv = document.getElementById('formal-symbols-data');
        if (!dataDiv)
            return [];
        try {
            const raw = dataDiv.getAttribute('data-symbols');
            const symbols = raw ? JSON.parse(raw) : [];
            return Array.isArray(symbols)
                ? symbols.map((symbol, index) => ({ ...symbol, index }))
                : [];
        }
        catch (err) {
            console.error('[markdown-formal] Failed to parse symbols', err);
            return [];
        }
    }
    function readFormulas() {
        const dataDiv = document.getElementById('formal-formulas-data');
        if (!dataDiv)
            return [];
        try {
            const raw = dataDiv.getAttribute('data-formulas');
            const formulas = raw ? JSON.parse(raw) : [];
            return Array.isArray(formulas) ? formulas.filter(formula => formula && formula.latex) : [];
        }
        catch (err) {
            console.error('[markdown-formal] Failed to parse formulas', err);
            return [];
        }
    }
    function mergeConfig(config) {
        const existing = config && typeof config === 'object' ? config : {};
        return {
            ...DEFAULT_CONFIG,
            ...existing,
            language: existing.language === 'en' ? 'en' : 'zh',
            dictionary: {
                zh: { ...(DEFAULT_CONFIG.dictionary?.zh || {}), ...(existing.dictionary?.zh || {}) },
                en: { ...(DEFAULT_CONFIG.dictionary?.en || {}), ...(existing.dictionary?.en || {}) }
            },
            ui: {
                zh: { ...(DEFAULT_CONFIG.ui?.zh || {}), ...(existing.ui?.zh || {}) },
                en: { ...(DEFAULT_CONFIG.ui?.en || {}), ...(existing.ui?.en || {}) }
            }
        };
    }
    function readConfig() {
        const dataDiv = document.getElementById('formal-config-data');
        if (!dataDiv)
            return mergeConfig(DEFAULT_CONFIG);
        try {
            const raw = dataDiv.getAttribute('data-config');
            return mergeConfig(raw ? JSON.parse(raw) : DEFAULT_CONFIG);
        }
        catch (err) {
            console.error('[markdown-formal] Failed to parse config', err);
            return mergeConfig(DEFAULT_CONFIG);
        }
    }
    function getLanguage(config) {
        return config.language === 'en' ? 'en' : 'zh';
    }
    function formatTemplate(template, values) {
        return template.replace(/\{(\w+)\}/g, (_match, key) => values[key] || '');
    }
    function uiText(config, key, values = {}) {
        const language = getLanguage(config);
        const text = config.ui?.[language]?.[key] || DEFAULT_CONFIG.ui?.[language]?.[key] || DEFAULT_CONFIG.ui?.zh?.[key] || '';
        return formatTemplate(text, values);
    }
    function readInjectedCurrentFilePath() {
        const dataDiv = document.getElementById('formal-pages-data');
        const filePath = dataDiv?.getAttribute('data-current-file') || '';
        return filePath ? normalizePath(filePath) : '';
    }
    function inferCurrentFilePathFromLocation(paths) {
        const haystacks = [window.location.pathname, window.location.href, document.baseURI || '']
            .map(value => decodePart(value));
        const normalizedPaths = paths
            .map(normalizePath)
            .filter(Boolean)
            .sort((a, b) => b.length - a.length);
        for (const filePath of normalizedPaths) {
            const plain = filePath.replace(/^\//, '');
            const encoded = encodeURI(filePath);
            if (haystacks.some(value => value.includes(filePath) || value.includes(plain) || value.includes(encoded))) {
                return filePath;
            }
        }
        return '';
    }
    function getCurrentFilePath(labels, pages) {
        const formalElement = document.querySelector('.formal-section[id^="formal-"], .formal-block[id^="formal-"]');
        if (!formalElement) {
            const injected = readInjectedCurrentFilePath();
            if (injected)
                return injected;
            const knownPaths = [
                ...pages.map(page => page.filePath),
                ...Object.values(labels).map(label => label.filePath)
            ].filter(Boolean);
            return inferCurrentFilePathFromLocation(knownPaths);
        }
        const id = formalElement.id.replace(/^formal-/, '');
        const label = labels[id];
        return label && label.filePath ? normalizePath(label.filePath) : '';
    }
    function readHistory() {
        const history = readJson(HISTORY_KEY, []);
        return normalizeHistory(history);
    }
    function writeHistory(history) {
        writeJson(HISTORY_KEY, normalizeHistory(history).slice(-60));
    }
    function normalizeHistory(history) {
        if (!Array.isArray(history))
            return [];
        return history
            .filter(item => item && typeof item.scroll === 'number' && typeof item.filePath === 'string')
            .map(item => {
            const normalized = {
                filePath: normalizePath(item.filePath),
                scroll: item.scroll
            };
            if (typeof item.anchorId === 'string' && item.anchorId) {
                normalized.anchorId = item.anchorId;
            }
            if (typeof item.anchorOffset === 'number') {
                normalized.anchorOffset = item.anchorOffset;
            }
            return normalized;
        })
            .slice(-60);
    }
    function getAnchorCandidates() {
        return Array.from(document.querySelectorAll('.formal-section[id], .formal-block[id], h1[id], h2[id], h3[id], h4[id]')).filter(element => !element.closest('#formal-nav-bar'));
    }
    function getScrollAnchor() {
        const viewportTop = window.scrollY + 16;
        let best;
        getAnchorCandidates().forEach(element => {
            const top = element.getBoundingClientRect().top + window.scrollY;
            if (top <= viewportTop && (!best || top > best.top)) {
                best = { id: element.id, top };
            }
        });
        if (!best)
            return {};
        return {
            anchorId: best.id,
            anchorOffset: window.scrollY - best.top
        };
    }
    function makeHistoryEntry(currentFilePath) {
        if (!currentFilePath)
            return undefined;
        return {
            filePath: currentFilePath,
            scroll: window.scrollY,
            ...getScrollAnchor()
        };
    }
    function appendHistoryEntry(history, entry) {
        if (!entry.filePath)
            return normalizeHistory(history);
        const normalized = normalizeHistory(history);
        const normalizedEntry = normalizeHistory([entry])[0];
        if (!normalizedEntry)
            return normalized;
        const latest = normalized[normalized.length - 1];
        if (!latest || latest.filePath !== normalizedEntry.filePath || Math.abs(latest.scroll - normalizedEntry.scroll) > 8) {
            normalized.push(normalizedEntry);
        }
        return normalized.slice(-60);
    }
    function pushHistory(currentFilePath) {
        const entry = makeHistoryEntry(currentFilePath);
        if (!entry)
            return;
        writeHistory(appendHistoryEntry(readHistory(), entry));
    }
    function currentHistoryWithReturn(currentFilePath) {
        const entry = makeHistoryEntry(currentFilePath);
        if (!entry)
            return readHistory();
        return appendHistoryEntry(readHistory(), entry);
    }
    function addReturnEntry(entry) {
        if (!entry.filePath)
            return;
        writeHistory(appendHistoryEntry(readHistory(), entry));
    }
    function applyPayloadHistory(payload) {
        if (payload.history) {
            writeHistory(payload.history);
        }
        if (payload.returnTo) {
            addReturnEntry(payload.returnTo);
        }
    }
    function basenameWithoutExtension(filePath) {
        const basename = filePath.split('/').pop() || filePath;
        return basename
            .replace(/^\d+-/, '')
            .replace(/^appendix[-_\s]?[a-z0-9]+[-_\s]?/i, '')
            .replace(/\.md$/i, '')
            .replace(/[-_]+/g, ' ');
    }
    function parseVolumeOrder(value) {
        if (/^\d+$/.test(value))
            return parseInt(value, 10);
        const roman = value.toUpperCase();
        if (!/^[IVXLCDM]+$/.test(roman))
            return Number.MAX_SAFE_INTEGER;
        const values = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
        let total = 0;
        let previous = 0;
        for (let i = roman.length - 1; i >= 0; i--) {
            const current = values[roman[i]] || 0;
            total += current < previous ? -current : current;
            previous = Math.max(previous, current);
        }
        return total || Number.MAX_SAFE_INTEGER;
    }
    function inferBookInfoFromPath(filePath, config) {
        const parts = normalizePath(filePath || '').replace(/^\//, '').split('/');
        const segment = parts.find(part => /^book[-_\s]?(?:\d+|[a-z0-9]+)(?:[-_\s].*)?$/i.test(part));
        if (!segment) {
            return { key: ROOT_BOOK_KEY, title: uiText(config, 'workspace'), order: 0 };
        }
        const match = segment.match(/^book[-_\s]?(\d+|[ivxlcdm]+)?(?:[-_\s].*)?$/i);
        const order = match && match[1] ? parseVolumeOrder(match[1]) : Number.MAX_SAFE_INTEGER;
        const title = order === Number.MAX_SAFE_INTEGER ? segment.replace(/[-_]+/g, ' ') : uiText(config, 'book', { number: String(order) });
        return {
            key: segment.toLowerCase(),
            title,
            order
        };
    }
    function inferBookInfo(label, config) {
        if (label.bookKey) {
            return {
                key: label.bookKey,
                title: label.bookTitle || label.bookKey,
                order: typeof label.bookOrder === 'number' ? label.bookOrder : Number.MAX_SAFE_INTEGER
            };
        }
        return inferBookInfoFromPath(label.filePath || '', config);
    }
    function inferVolumeInfo(label, config) {
        if (label.volumeKey) {
            return {
                key: label.volumeKey,
                title: label.volumeTitle || label.volumeKey,
                order: typeof label.volumeOrder === 'number' ? label.volumeOrder : Number.MAX_SAFE_INTEGER,
                hasVolume: true
            };
        }
        const parts = normalizePath(label.filePath || '').replace(/^\//, '').split('/');
        const segment = parts.find(part => /^(?:vol|volume)[-_\s]?(?:\d+|[ivxlcdm]+)(?:[-_\s].*)?$/i.test(part));
        if (!segment) {
            return { key: ROOT_VOLUME_KEY, title: uiText(config, 'unvolumed'), order: 0, hasVolume: false };
        }
        const match = segment.match(/^(?:vol|volume)[-_\s]?(\d+|[ivxlcdm]+)(?:[-_\s].*)?$/i);
        const order = match ? parseVolumeOrder(match[1]) : Number.MAX_SAFE_INTEGER;
        const title = order === Number.MAX_SAFE_INTEGER ? segment.replace(/[-_]+/g, ' ') : uiText(config, 'volume', { number: String(order) });
        return {
            key: segment.toLowerCase(),
            title,
            order,
            hasVolume: true
        };
    }
    function inferNumberingUnit(label) {
        if (label.unitKind && label.unitKey && label.unitLabel) {
            return {
                kind: label.unitKind,
                key: label.unitKey,
                label: label.unitLabel,
                order: typeof label.unitOrder === 'number' ? label.unitOrder : Number.MAX_SAFE_INTEGER,
                chapter: label.chapter,
                appendix: label.appendix
            };
        }
        if (typeof label.chapter === 'number') {
            return {
                kind: 'chapter',
                key: `chapter-${label.chapter}`,
                label: String(label.chapter),
                order: label.chapter,
                chapter: label.chapter
            };
        }
        if (label.appendix) {
            return {
                kind: 'appendix',
                key: `appendix-${label.appendix.toLowerCase()}`,
                label: label.appendix,
                order: Number.MAX_SAFE_INTEGER,
                appendix: label.appendix
            };
        }
        return null;
    }
    function inferBookInfoFromPage(page, config) {
        if (page.bookKey) {
            return {
                key: page.bookKey,
                title: page.bookTitle || page.bookKey,
                order: typeof page.bookOrder === 'number' ? page.bookOrder : Number.MAX_SAFE_INTEGER
            };
        }
        return inferBookInfoFromPath(page.filePath || '', config);
    }
    function inferVolumeInfoFromPage(page, config) {
        if (page.volumeKey) {
            return {
                key: page.volumeKey,
                title: page.volumeTitle || page.volumeKey,
                order: typeof page.volumeOrder === 'number' ? page.volumeOrder : Number.MAX_SAFE_INTEGER,
                hasVolume: true
            };
        }
        return inferVolumeInfo({ type: '', title: '', filePath: page.filePath }, config);
    }
    function findPrimaryTargetId(filePath, labels, unitKey) {
        const entries = Object.entries(labels).filter(([, label]) => normalizePath(label.filePath) === normalizePath(filePath));
        const firstSection = entries.find(([, label]) => label.type === 'section' && label.number === 1 && (!unitKey || label.unitKey === unitKey));
        const fallback = firstSection || entries.find(([, label]) => label.type === 'section') || entries[0];
        return fallback ? `formal-${fallback[0]}` : undefined;
    }
    function pageToChapterItem(page, labels, config) {
        const book = inferBookInfoFromPage(page, config);
        const volume = inferVolumeInfoFromPage(page, config);
        const unitKind = page.unitKind || page.kind;
        const unitLabel = page.unitLabel || (page.kind === 'intro' ? uiText(config, 'introBadge') : page.kind === 'summary' ? uiText(config, 'summaryBadge') : '');
        return {
            bookKey: book.key,
            bookTitle: book.title,
            bookOrder: book.order,
            unitKind,
            unitKey: page.unitKey || page.kind,
            unitLabel,
            unitOrder: typeof page.unitOrder === 'number' ? page.unitOrder : page.order,
            chapter: page.chapter,
            appendix: page.appendix,
            filePath: normalizePath(page.filePath),
            targetId: findPrimaryTargetId(page.filePath, labels, page.unitKey),
            title: page.title || basenameWithoutExtension(page.filePath),
            volumeKey: volume.key,
            volumeTitle: volume.title,
            volumeOrder: volume.order,
            hasVolume: volume.hasVolume
        };
    }
    function collectChapters(labels, pages, currentFilePath, config) {
        if (pages.length > 0) {
            const currentBook = currentFilePath ? inferBookInfoFromPath(currentFilePath, config) : undefined;
            return pages
                .filter(page => ['intro', 'summary', 'chapter', 'appendix'].includes(page.kind))
                .map(page => pageToChapterItem(page, labels, config))
                .filter(item => !currentBook || item.bookKey === currentBook.key)
                .sort((a, b) => {
                if (a.bookOrder !== b.bookOrder)
                    return a.bookOrder - b.bookOrder;
                if (a.volumeOrder !== b.volumeOrder)
                    return a.volumeOrder - b.volumeOrder;
                if (a.unitOrder !== b.unitOrder)
                    return a.unitOrder - b.unitOrder;
                return a.filePath.localeCompare(b.filePath);
            });
        }
        const byChapter = new Map();
        const currentBook = currentFilePath ? inferBookInfoFromPath(currentFilePath, config) : undefined;
        Object.entries(labels).forEach(([id, label]) => {
            if (!label || !label.filePath)
                return;
            const book = inferBookInfo(label, config);
            if (currentBook && book.key !== currentBook.key)
                return;
            const unit = inferNumberingUnit(label);
            if (!unit)
                return;
            const volume = inferVolumeInfo(label, config);
            const key = `${book.key}:${volume.key}:${unit.kind}:${unit.key}`;
            const existing = byChapter.get(key);
            const item = {
                bookKey: book.key,
                bookTitle: book.title,
                bookOrder: book.order,
                unitKind: unit.kind,
                unitKey: unit.key,
                unitLabel: unit.label,
                unitOrder: unit.order,
                chapter: unit.chapter,
                appendix: unit.appendix,
                filePath: normalizePath(label.filePath),
                targetId: `formal-${id}`,
                title: label.title || basenameWithoutExtension(label.filePath),
                volumeKey: volume.key,
                volumeTitle: volume.title,
                volumeOrder: volume.order,
                hasVolume: volume.hasVolume
            };
            if (!existing) {
                byChapter.set(key, item);
                return;
            }
            const existingLabelId = existing.targetId ? existing.targetId.replace(/^formal-/, '') : '';
            const existingLabel = labels[existingLabelId];
            const existingIsFirstSection = existingLabel?.type === 'section' && existingLabel.number === 1;
            const candidateIsFirstSection = label.type === 'section' && label.number === 1;
            if (!existingIsFirstSection && candidateIsFirstSection) {
                byChapter.set(key, item);
            }
        });
        return Array.from(byChapter.values()).sort((a, b) => {
            if (a.bookOrder !== b.bookOrder)
                return a.bookOrder - b.bookOrder;
            if (a.volumeOrder !== b.volumeOrder)
                return a.volumeOrder - b.volumeOrder;
            if (a.unitOrder !== b.unitOrder)
                return a.unitOrder - b.unitOrder;
            return a.filePath.localeCompare(b.filePath);
        });
    }
    function groupChaptersByVolume(chapters) {
        const groups = new Map();
        chapters.forEach(chapter => {
            const existing = groups.get(chapter.volumeKey);
            if (existing) {
                existing.chapters.push(chapter);
                return;
            }
            groups.set(chapter.volumeKey, {
                key: chapter.volumeKey,
                title: chapter.volumeTitle,
                order: chapter.volumeOrder,
                hasVolume: chapter.hasVolume,
                chapters: [chapter]
            });
        });
        return Array.from(groups.values()).sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
    }
    function getCurrentChapter(chapters, currentFilePath) {
        return chapters.find(chapter => chapter.filePath === currentFilePath);
    }
    function getUnitDisplayTitle(chapter, config) {
        if (chapter.unitKind === 'intro')
            return uiText(config, 'intro');
        if (chapter.unitKind === 'summary')
            return uiText(config, 'summary');
        return chapter.unitKind === 'appendix'
            ? uiText(config, 'appendix', { label: chapter.unitLabel })
            : uiText(config, 'chapter', { number: chapter.unitLabel });
    }
    function getUnitBadge(chapter, config) {
        if (chapter.unitKind === 'intro')
            return uiText(config, 'introBadge');
        if (chapter.unitKind === 'summary')
            return uiText(config, 'summaryBadge');
        return chapter.unitKind === 'appendix' ? chapter.unitLabel : chapter.unitLabel.padStart(2, '0');
    }
    function formatLabelNumber(label) {
        const prefix = label.unitLabel || (typeof label.chapter === 'number' ? String(label.chapter) : label.appendix || '');
        return prefix && typeof label.number === 'number' ? `${prefix}.${label.number}` : '';
    }
    function nearestSectionLabel(filePath, line, labels) {
        if (line === undefined)
            return undefined;
        const normalizedFile = normalizePath(filePath);
        return Object.values(labels)
            .filter(label => label.type === 'section'
            && normalizePath(label.filePath) === normalizedFile
            && typeof label.startLine === 'number'
            && label.startLine + 1 <= line)
            .sort((a, b) => (b.startLine || 0) - (a.startLine || 0))[0];
    }
    function locationLabelForFile(filePath, line, config) {
        const normalizedFile = normalizePath(filePath || '');
        if (!normalizedFile)
            return uiText(config, 'workspace');
        const labels = readLabels();
        const pages = readPages();
        const page = pages.find(item => normalizePath(item.filePath) === normalizedFile);
        const section = nearestSectionLabel(normalizedFile, line, labels);
        if (section?.title) {
            const number = formatLabelNumber(section);
            return number ? `§ ${number} ${section.title}` : section.title;
        }
        if (page) {
            const chapter = pageToChapterItem(page, labels, config);
            const unitTitle = getUnitDisplayTitle(chapter, config);
            return chapter.title ? `${unitTitle} · ${chapter.title}` : unitTitle;
        }
        const book = inferBookInfoFromPath(normalizedFile, config);
        return book.key !== '__workspace__' ? book.title : uiText(config, 'workspace');
    }
    function allowedLookupBookKeys(currentFilePath, config) {
        const currentBook = inferBookInfoFromPath(currentFilePath, config).key;
        const dependencies = config.lookup?.bookDependencies || {};
        const allowed = new Set();
        const visit = (bookKey) => {
            if (!bookKey || allowed.has(bookKey))
                return;
            allowed.add(bookKey);
            (dependencies[bookKey] || []).forEach(visit);
        };
        visit(currentBook);
        return allowed;
    }
    function definitionInLookupScope(definition, currentFilePath, config) {
        if (!currentFilePath)
            return true;
        const allowed = allowedLookupBookKeys(currentFilePath, config);
        const key = definition.bookKey || inferBookInfoFromPath(definition.filePath || '', config).key;
        return allowed.has(key);
    }
    function definitionLocationLabel(definition, config) {
        return locationLabelForFile(definition.filePath, definition.line, config);
    }
    function symbolLocationLabel(symbol, config) {
        return locationLabelForFile(symbol.sourceFilePath, symbol.sourceLine, config);
    }
    function normalizeDefinitionQuery(value) {
        return String(value || '')
            .normalize('NFKC')
            .replace(/[`*_~#$@()[\]{}（）【】「」『』《》〈〉:：,，.。;；!?！？]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }
    function definitionScore(definition, query) {
        const normalizedQuery = normalizeDefinitionQuery(query);
        if (!normalizedQuery)
            return Number.MAX_SAFE_INTEGER;
        const title = normalizeDefinitionQuery(definition.title || '');
        if (!title)
            return Number.MAX_SAFE_INTEGER;
        if (title === normalizedQuery)
            return 0;
        if (title.startsWith(normalizedQuery))
            return 1;
        if (normalizedQuery.includes(title))
            return 2;
        if (title.includes(normalizedQuery))
            return 3;
        return Number.MAX_SAFE_INTEGER;
    }
    function searchDefinitions(definitions, query, currentFilePath, config, limit = 12) {
        return definitions
            .filter(definition => definitionInLookupScope(definition, currentFilePath, config))
            .map(definition => ({ definition, score: definitionScore(definition, query) }))
            .filter(item => item.score < Number.MAX_SAFE_INTEGER)
            .sort((a, b) => {
            if (a.score !== b.score)
                return a.score - b.score;
            const titleDelta = (a.definition.title || '').length - (b.definition.title || '').length;
            if (titleDelta !== 0)
                return titleDelta;
            return `${a.definition.filePath}:${a.definition.line}`.localeCompare(`${b.definition.filePath}:${b.definition.line}`);
        })
            .slice(0, limit)
            .map(item => item.definition);
    }
    function normalizeLatexSymbol(value) {
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
    function symbolInScope(symbol, currentFilePath, config) {
        if (!symbol.sourceFilePath)
            return true;
        const sourcePath = normalizePath(symbol.sourceFilePath);
        const scope = (symbol.scope || 'book').toLowerCase();
        if (scope === 'workspace' || scope === 'global')
            return true;
        if (scope === 'file' || scope === 'chapter')
            return sourcePath === currentFilePath;
        if (scope === 'book') {
            return allowedLookupBookKeys(currentFilePath, config).has(inferBookInfoFromPath(sourcePath, config).key);
        }
        return true;
    }
    function buildSymbolMatch(symbol, latex, match) {
        const captures = {};
        (symbol.captures || []).forEach((name, index) => {
            captures[name] = match[index + 1] || '';
        });
        return { symbol, latex, captures };
    }
    function matchSymbol(symbol, latex) {
        try {
            const normalizedLatex = normalizeLatexSymbol(latex);
            const match = normalizedLatex.match(new RegExp(symbol.regex));
            return match ? buildSymbolMatch(symbol, latex, match) : undefined;
        }
        catch (_err) {
            return undefined;
        }
    }
    function findSymbolMatches(symbols, latex, currentFilePath, config, limit = 8) {
        return symbols
            .filter(symbol => symbolInScope(symbol, currentFilePath, config))
            .map(symbol => matchSymbol(symbol, latex))
            .filter((match) => Boolean(match))
            .slice(0, limit);
    }
    function symbolSearchScore(symbol, query) {
        const latexQuery = normalizeLatexSymbol(query);
        const pattern = normalizeLatexSymbol(symbol.pattern);
        const display = normalizeLatexSymbol(symbol.display);
        if (!latexQuery)
            return Number.MAX_SAFE_INTEGER;
        if (latexQuery && (pattern === latexQuery || display === latexQuery))
            return 0;
        if (latexQuery && (pattern.includes(latexQuery) || display.includes(latexQuery)))
            return 1;
        return Number.MAX_SAFE_INTEGER;
    }
    function searchSymbols(symbols, query, currentFilePath, config, limit = 10) {
        return symbols
            .filter(symbol => symbolInScope(symbol, currentFilePath, config))
            .map(symbol => ({ symbol, score: symbolSearchScore(symbol, query) }))
            .filter(item => item.score < Number.MAX_SAFE_INTEGER)
            .sort((a, b) => a.score - b.score || a.symbol.pattern.localeCompare(b.symbol.pattern))
            .slice(0, limit)
            .map(item => item.symbol);
    }
    function collectFormulaNodes() {
        const selectors = [
            'mjx-container',
            '.katex-display > .katex',
            '.katex'
        ];
        const nodes = Array.from(document.querySelectorAll(selectors.join(',')))
            .filter(node => !node.closest('#formal-nav-bar, #formal-definition-popover, #formal-definition-selection-action, #formal-labels-data, #formal-pages-data, #formal-definitions-data, #formal-symbols-data, #formal-formulas-data, #formal-definition-templates, #formal-symbol-templates'))
            .filter(node => {
            if (node.matches('.katex') && node.parentElement?.closest('.katex'))
                return false;
            return true;
        });
        return nodes;
    }
    function encodeCaptures(value) {
        return encodeURIComponent(JSON.stringify(value));
    }
    function decodeCaptures(value) {
        if (!value)
            return {};
        try {
            return JSON.parse(decodeURIComponent(value));
        }
        catch (_err) {
            return {};
        }
    }
    function bindSymbolFormulas(symbols, formulas, currentFilePath, config) {
        if (symbols.length === 0 || formulas.length === 0)
            return 0;
        const nodes = collectFormulaNodes();
        const limit = Math.min(nodes.length, formulas.length);
        for (let i = 0; i < limit; i++) {
            const node = nodes[i];
            const formula = formulas[i];
            node.setAttribute('data-formal-latex', formula.latex);
            node.classList.remove('formal-symbol-match');
            node.removeAttribute('data-formal-symbol-index');
            node.removeAttribute('data-formal-symbol-captures');
            const matches = findSymbolMatches(symbols, formula.latex, currentFilePath, config, 1);
            if (matches.length === 0)
                continue;
            node.classList.add('formal-symbol-match');
            node.setAttribute('data-formal-symbol-index', String(matches[0].symbol.index));
            node.setAttribute('data-formal-symbol-captures', encodeCaptures(matches[0].captures));
            node.setAttribute('title', matches[0].symbol.pattern);
        }
        return limit;
    }
    function getDefinitionElement(definition) {
        if (definition.targetId) {
            const target = getTargetElement(definition.targetId);
            if (target)
                return target;
        }
        if (definition.index !== undefined) {
            const byIndex = document.querySelector(`[data-formal-definition-index="${definition.index}"]`);
            if (byIndex)
                return byIndex;
        }
        return null;
    }
    function flashDefinitionElement(element) {
        element.classList.add('formal-definition-highlight');
        window.setTimeout(() => element.classList.remove('formal-definition-highlight'), 1600);
    }
    function scrollToSourceLine(line) {
        if (line === undefined)
            return false;
        const element = document.querySelector(`[data-line="${line - 1}"]`);
        if (!element)
            return false;
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        flashDefinitionElement(element);
        return true;
    }
    function openDefinition(definition) {
        const labels = readLabels();
        const pages = readPages();
        const currentFilePath = getCurrentFilePath(labels, pages);
        const targetFilePath = normalizePath(definition.filePath);
        if (!targetFilePath || targetFilePath === currentFilePath) {
            pushHistory(currentFilePath);
            const element = getDefinitionElement(definition);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                flashDefinitionElement(element);
            }
            else if (definition.targetId) {
                scrollToTarget(definition.targetId);
            }
            scheduleRebuild();
            return;
        }
        const history = currentHistoryWithReturn(currentFilePath);
        writeHistory(history);
        navigateToFile(targetFilePath, {
            targetId: definition.targetId,
            returnTo: history[history.length - 1],
            history
        });
    }
    function openSymbolSource(symbol) {
        const targetFilePath = normalizePath(symbol.sourceFilePath || '');
        if (!targetFilePath)
            return;
        const sourceDefinition = readDefinitions()
            .find(definition => normalizePath(definition.filePath) === targetFilePath && definition.line === symbol.sourceLine);
        if (sourceDefinition) {
            openDefinition(sourceDefinition);
            return;
        }
        const labels = readLabels();
        const pages = readPages();
        const currentFilePath = getCurrentFilePath(labels, pages);
        if (targetFilePath === currentFilePath) {
            pushHistory(currentFilePath);
            scrollToSourceLine(symbol.sourceLine);
            scheduleRebuild();
            return;
        }
        const history = currentHistoryWithReturn(currentFilePath);
        writeHistory(history);
        navigateToFile(targetFilePath, {
            returnTo: history[history.length - 1],
            history
        });
    }
    function getDefinitionTemplate(definition) {
        if (definition.index === undefined)
            return undefined;
        return Array.from(document.querySelectorAll('#formal-definition-templates template[data-definition-index]'))
            .find(template => Number(template.getAttribute('data-definition-index')) === definition.index);
    }
    function getSymbolDisplayTemplate(symbol) {
        if (symbol.index === undefined)
            return undefined;
        return Array.from(document.querySelectorAll('#formal-symbol-templates template[data-symbol-display-index]'))
            .find(template => Number(template.getAttribute('data-symbol-display-index')) === symbol.index);
    }
    function getSymbolMeaningTemplate(symbol) {
        if (symbol.index === undefined)
            return undefined;
        return Array.from(document.querySelectorAll('#formal-symbol-templates template[data-symbol-meaning-index]'))
            .find(template => Number(template.getAttribute('data-symbol-meaning-index')) === symbol.index);
    }
    function removeDefinitionPopover() {
        document.getElementById('formal-definition-popover')?.remove();
    }
    function removeDefinitionSelectionAction() {
        document.getElementById('formal-definition-selection-action')?.remove();
    }
    function positionFloatingElement(element, origin) {
        const margin = 12;
        const width = Math.min(460, Math.max(300, window.innerWidth - margin * 2));
        element.style.width = `${width}px`;
        let x = margin;
        let y = margin;
        if (origin instanceof Element) {
            const rect = origin.getBoundingClientRect();
            x = rect.left;
            y = rect.bottom + 8;
        }
        else {
            x = origin.x;
            y = origin.y + 8;
        }
        document.body.appendChild(element);
        const rect = element.getBoundingClientRect();
        const left = clamp(x, margin, window.innerWidth - rect.width - margin);
        const belowFits = y + rect.height <= window.innerHeight - margin;
        const top = belowFits ? y : clamp(y - rect.height - 18, margin, window.innerHeight - rect.height - margin);
        element.style.left = `${left}px`;
        element.style.top = `${top}px`;
    }
    function appendDefinitionContent(container, definition) {
        const template = getDefinitionTemplate(definition);
        if (template) {
            container.appendChild(document.importNode(template.content, true));
            return;
        }
        const fallback = document.createElement('pre');
        fallback.className = 'formal-definition-fallback';
        fallback.textContent = definition.content || definition.title;
        container.appendChild(fallback);
    }
    function appendDefinitionPreview(container, definition) {
        const template = getDefinitionTemplate(definition);
        if (template) {
            const content = document.importNode(template.content, true);
            container.appendChild(content);
            return;
        }
        const fallback = document.createElement('span');
        fallback.textContent = definition.content || definition.title;
        container.appendChild(fallback);
    }
    function appendSymbolDisplay(container, symbol, formulaElement) {
        if (formulaElement) {
            container.appendChild(formulaElement.cloneNode(true));
            return;
        }
        const template = getSymbolDisplayTemplate(symbol);
        if (template) {
            container.appendChild(document.importNode(template.content, true));
            return;
        }
        const fallback = document.createElement('code');
        fallback.textContent = symbol.display || symbol.pattern;
        container.appendChild(fallback);
    }
    function appendSymbolMeaning(container, match) {
        const template = getSymbolMeaningTemplate(match.symbol);
        if (template) {
            container.appendChild(document.importNode(template.content, true));
        }
        else {
            const fallback = document.createElement('span');
            fallback.textContent = match.symbol.meaning;
            container.appendChild(fallback);
        }
        const captureEntries = Object.entries(match.captures).filter(([, value]) => value);
        if (captureEntries.length > 0) {
            const captures = document.createElement('div');
            captures.className = 'formal-symbol-captures';
            captureEntries.forEach(([name, value]) => {
                const item = document.createElement('span');
                item.className = 'formal-symbol-capture';
                item.textContent = `${name}: ${value}`;
                captures.appendChild(item);
            });
            container.appendChild(captures);
        }
    }
    function showSymbolDetail(match, origin, config) {
        removeDefinitionSelectionAction();
        removeDefinitionPopover();
        const popover = document.createElement('div');
        popover.id = 'formal-definition-popover';
        popover.className = 'formal-definition-popover formal-symbol-popover';
        const header = document.createElement('div');
        header.className = 'formal-definition-popover-header';
        const heading = document.createElement('div');
        heading.className = 'formal-definition-popover-title formal-symbol-popover-title';
        appendSymbolDisplay(heading, match.symbol, match.formulaElement);
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'formal-definition-close';
        close.textContent = '×';
        close.addEventListener('click', removeDefinitionPopover);
        header.append(heading, close);
        const location = document.createElement('div');
        location.className = 'formal-definition-location';
        location.textContent = symbolLocationLabel(match.symbol, config);
        const content = document.createElement('div');
        content.className = 'formal-definition-content formal-symbol-content';
        appendSymbolMeaning(content, match);
        const footer = document.createElement('div');
        footer.className = 'formal-definition-footer';
        if (match.symbol.sourceFilePath) {
            const locate = document.createElement('button');
            locate.type = 'button';
            locate.className = 'formal-definition-locate';
            locate.textContent = uiText(config, 'definitionLocate');
            locate.addEventListener('click', () => openSymbolSource(match.symbol));
            footer.appendChild(locate);
        }
        popover.append(header, location, content, footer);
        positionFloatingElement(popover, origin);
    }
    function showDefinitionDetail(definition, origin, config) {
        removeDefinitionSelectionAction();
        removeDefinitionPopover();
        const popover = document.createElement('div');
        popover.id = 'formal-definition-popover';
        popover.className = 'formal-definition-popover';
        const header = document.createElement('div');
        header.className = 'formal-definition-popover-header';
        const heading = document.createElement('div');
        heading.className = 'formal-definition-popover-title';
        heading.textContent = definition.title || uiText(config, 'definitionContextTitle');
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'formal-definition-close';
        close.textContent = '×';
        close.addEventListener('click', removeDefinitionPopover);
        header.append(heading, close);
        const location = document.createElement('div');
        location.className = 'formal-definition-location';
        location.textContent = definitionLocationLabel(definition, config);
        const content = document.createElement('div');
        content.className = 'formal-definition-content';
        appendDefinitionContent(content, definition);
        const footer = document.createElement('div');
        footer.className = 'formal-definition-footer';
        const locate = document.createElement('button');
        locate.type = 'button';
        locate.className = 'formal-definition-locate';
        locate.textContent = uiText(config, 'definitionLocate');
        locate.addEventListener('click', () => openDefinition(definition));
        footer.appendChild(locate);
        popover.append(header, location, content, footer);
        positionFloatingElement(popover, origin);
    }
    function showDefinitionLookupPopover(query, results, origin, config) {
        removeDefinitionSelectionAction();
        if (results.length === 1) {
            showDefinitionDetail(results[0], origin, config);
            return;
        }
        removeDefinitionPopover();
        const popover = document.createElement('div');
        popover.id = 'formal-definition-popover';
        popover.className = 'formal-definition-popover formal-definition-results-popover';
        const header = document.createElement('div');
        header.className = 'formal-definition-popover-header';
        const heading = document.createElement('div');
        heading.className = 'formal-definition-popover-title';
        heading.textContent = `${uiText(config, 'definitionContextTitle')}: ${query}`;
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'formal-definition-close';
        close.textContent = '×';
        close.addEventListener('click', removeDefinitionPopover);
        header.append(heading, close);
        popover.appendChild(header);
        const list = document.createElement('div');
        list.className = 'formal-definition-result-list';
        results.forEach(definition => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'formal-definition-result';
            item.addEventListener('click', () => {
                const rect = item.getBoundingClientRect();
                showDefinitionDetail(definition, { x: rect.left, y: rect.bottom }, config);
            });
            const title = document.createElement('span');
            title.className = 'formal-definition-result-title';
            title.textContent = definition.title;
            const meta = document.createElement('span');
            meta.className = 'formal-definition-result-meta';
            meta.textContent = definitionLocationLabel(definition, config);
            item.append(title, meta);
            list.appendChild(item);
        });
        popover.appendChild(list);
        positionFloatingElement(popover, origin);
    }
    function renderDefinitionSearchResults(panel, definitions, symbols, query, currentFilePath, config) {
        panel.replaceChildren();
        const normalizedQuery = normalizeDefinitionQuery(query);
        panel.classList.toggle('formal-definition-search-open', Boolean(normalizedQuery));
        if (!normalizedQuery)
            return;
        const results = searchDefinitions(definitions, query, currentFilePath, config, 10);
        const symbolResults = searchSymbols(symbols, query, currentFilePath, config, 10);
        if (results.length === 0 && symbolResults.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'formal-definition-search-empty';
            empty.textContent = uiText(config, 'definitionSearchEmpty');
            panel.appendChild(empty);
            return;
        }
        results.forEach(definition => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'formal-definition-search-result';
            item.addEventListener('click', () => {
                openDefinition(definition);
                panel.classList.remove('formal-definition-search-open');
            });
            const title = document.createElement('span');
            title.className = 'formal-definition-search-title';
            title.textContent = definition.title;
            const meta = document.createElement('span');
            meta.className = 'formal-definition-search-meta';
            meta.textContent = definitionLocationLabel(definition, config);
            const preview = document.createElement('span');
            preview.className = 'formal-definition-search-preview';
            appendDefinitionPreview(preview, definition);
            item.append(title, meta, preview);
            panel.appendChild(item);
        });
        symbolResults.forEach(symbol => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'formal-definition-search-result formal-symbol-search-result';
            item.addEventListener('click', () => {
                openSymbolSource(symbol);
                panel.classList.remove('formal-definition-search-open');
            });
            const title = document.createElement('span');
            title.className = 'formal-definition-search-title formal-symbol-search-title';
            appendSymbolDisplay(title, symbol);
            const meta = document.createElement('span');
            meta.className = 'formal-definition-search-meta';
            meta.textContent = symbolLocationLabel(symbol, config);
            const preview = document.createElement('span');
            preview.className = 'formal-definition-search-preview formal-symbol-search-preview';
            appendSymbolMeaning(preview, { symbol, latex: symbol.pattern, captures: {} });
            item.append(title, meta, preview);
            panel.appendChild(item);
        });
    }
    function getSelectedLookupText() {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed)
            return '';
        const text = selection.toString().replace(/\s+/g, ' ').trim();
        return text.length <= 80 ? text : '';
    }
    function getSelectionRect() {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed)
            return undefined;
        const range = selection.getRangeAt(0);
        const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0);
        return rects[rects.length - 1] || undefined;
    }
    function showDefinitionSelectionAction(query, results, rect, config) {
        removeDefinitionSelectionAction();
        const action = document.createElement('button');
        action.id = 'formal-definition-selection-action';
        action.type = 'button';
        action.className = 'formal-definition-selection-action';
        action.textContent = uiText(config, 'definitionSearch');
        action.addEventListener('mousedown', event => {
            event.preventDefault();
            event.stopPropagation();
        });
        action.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            suppressedSelectionText = normalizeDefinitionQuery(query);
            removeDefinitionSelectionAction();
            showDefinitionLookupPopover(query, results, { x: rect.left, y: rect.bottom }, config);
        });
        document.body.appendChild(action);
        const actionRect = action.getBoundingClientRect();
        const margin = 8;
        const left = clamp(rect.left, margin, window.innerWidth - actionRect.width - margin);
        const top = rect.bottom + actionRect.height + 12 <= window.innerHeight
            ? rect.bottom + 6
            : Math.max(margin, rect.top - actionRect.height - 6);
        action.style.left = `${left}px`;
        action.style.top = `${top}px`;
    }
    function refreshDefinitionSelectionAction() {
        const active = document.activeElement;
        if (active instanceof HTMLElement && active.closest('#formal-nav-bar, #formal-definition-popover, input, textarea, code, pre')) {
            removeDefinitionSelectionAction();
            return;
        }
        const selectedText = getSelectedLookupText();
        const rect = getSelectionRect();
        if (!selectedText || !rect) {
            suppressedSelectionText = '';
            removeDefinitionSelectionAction();
            return;
        }
        const normalizedSelectedText = normalizeDefinitionQuery(selectedText);
        if (suppressedSelectionText && suppressedSelectionText === normalizedSelectedText) {
            removeDefinitionSelectionAction();
            return;
        }
        if (suppressedSelectionText && suppressedSelectionText !== normalizedSelectedText) {
            suppressedSelectionText = '';
        }
        const definitions = readDefinitions();
        const labels = readLabels();
        const pages = readPages();
        const config = readConfig();
        const currentFilePath = getCurrentFilePath(labels, pages);
        const results = searchDefinitions(definitions, selectedText, currentFilePath, config, 8);
        if (results.length === 0) {
            removeDefinitionSelectionAction();
            return;
        }
        showDefinitionSelectionAction(selectedText, results, rect, config);
    }
    function scheduleDefinitionSelectionAction() {
        window.setTimeout(refreshDefinitionSelectionAction, 0);
    }
    function setImportantStyle(element, property, value) {
        element.style.setProperty(property, value, 'important');
    }
    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }
    function positionTooltip(wrap) {
        const tooltip = wrap.querySelector('.formal-tooltip');
        if (!tooltip)
            return;
        const viewportMargin = 12;
        const wrapRect = wrap.getBoundingClientRect();
        const width = Math.min(450, Math.max(280, window.innerWidth - viewportMargin * 2));
        setImportantStyle(tooltip, 'position', 'fixed');
        setImportantStyle(tooltip, 'width', `${width}px`);
        setImportantStyle(tooltip, 'max-width', `${width}px`);
        setImportantStyle(tooltip, 'left', '0px');
        setImportantStyle(tooltip, 'right', 'auto');
        setImportantStyle(tooltip, 'top', '0px');
        setImportantStyle(tooltip, 'bottom', 'auto');
        setImportantStyle(tooltip, 'transform', 'none');
        setImportantStyle(tooltip, 'margin-top', '0');
        setImportantStyle(tooltip, 'margin-bottom', '0');
        const rect = tooltip.getBoundingClientRect();
        const height = Math.min(rect.height || 240, window.innerHeight - viewportMargin * 2);
        const left = clamp(wrapRect.left + wrapRect.width / 2 - width / 2, viewportMargin, window.innerWidth - width - viewportMargin);
        const below = wrapRect.bottom + 8;
        const above = wrapRect.top - height - 8;
        const top = below + height <= window.innerHeight - viewportMargin ? below : Math.max(viewportMargin, above);
        setImportantStyle(tooltip, 'left', `${left}px`);
        setImportantStyle(tooltip, 'top', `${top}px`);
    }
    function getTargetElement(targetId) {
        if (!targetId)
            return null;
        return document.getElementById(targetId) || document.getElementById(`formal-${targetId.replace(/^formal-/, '')}`);
    }
    function scrollToTarget(targetId, behavior = 'smooth') {
        const element = getTargetElement(targetId);
        if (!element)
            return false;
        element.scrollIntoView({ behavior, block: 'start' });
        return true;
    }
    function getMaxScroll() {
        const documentHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, document.documentElement.offsetHeight, document.body.offsetHeight);
        return Math.max(0, documentHeight - window.innerHeight);
    }
    function scrollToOffset(scroll, behavior = 'smooth') {
        const maxScroll = getMaxScroll();
        const target = clamp(scroll, 0, maxScroll);
        window.scrollTo({ top: target, behavior });
        const hasEnoughDocumentHeight = scroll <= maxScroll + 8;
        const reachedTarget = Math.abs(window.scrollY - target) <= 8;
        return hasEnoughDocumentHeight && reachedTarget;
    }
    function restoreHistoryEntry(entry, behavior = 'smooth') {
        if (entry.anchorId) {
            const anchor = getTargetElement(entry.anchorId);
            if (anchor) {
                const top = anchor.getBoundingClientRect().top + window.scrollY + (entry.anchorOffset || 0);
                return scrollToOffset(top, behavior);
            }
        }
        return scrollToOffset(entry.scroll, behavior);
    }
    function makeNavHash(payload) {
        return `#${NAV_HASH_PREFIX}${encodePayload(payload)}`;
    }
    function navigateToFile(filePath, payload = {}) {
        window.name = `${WINDOW_NAV_PREFIX}${encodePayload(payload)}`;
        const href = `${filePath}${makeNavHash(payload)}`;
        const anchor = document.createElement('a');
        anchor.href = href;
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
    }
    function applyIncomingNavigation() {
        const incomingKey = window.name.startsWith(WINDOW_NAV_PREFIX) ? window.name : getLocationNavHash();
        if (!incomingKey || incomingKey === appliedNavigationHash)
            return;
        const payload = readIncomingPayload();
        if (!payload)
            return;
        appliedNavigationHash = getLocationNavHash() || incomingKey;
        applyPayloadHistory(payload);
        const startedAt = Date.now();
        const tryApply = () => {
            if (payload.targetId && scrollToTarget(payload.targetId, 'auto'))
                return;
            if (!payload.targetId && typeof payload.scroll === 'number') {
                if (restoreHistoryEntry({
                    scroll: payload.scroll,
                    anchorId: payload.anchorId,
                    anchorOffset: payload.anchorOffset
                }, 'auto'))
                    return;
            }
            if (Date.now() - startedAt < 3000) {
                window.setTimeout(tryApply, 50);
            }
        };
        window.setTimeout(tryApply, 0);
    }
    function collectTocItems() {
        const items = [];
        document.querySelectorAll('.formal-section, .formal-prop, .formal-lemma, .formal-theorem, .formal-cor, .formal-remark, .formal-example').forEach(el => {
            if (!el.id)
                return;
            const display = (el.getAttribute('data-formal-display') || '').trim();
            const dataTitle = (el.getAttribute('data-formal-title') || '').trim();
            if (el.classList.contains('formal-section')) {
                const fallback = el.innerText.trim();
                const title = dataTitle || (display ? fallback.replace(display, '').trim() : fallback) || fallback;
                items.push({ id: el.id, display, title, type: 'section' });
                return;
            }
            const strong = el.querySelector('strong');
            const title = strong?.textContent?.replace(/[：:]$/, '').trim()
                || dataTitle
                || el.innerText.split(/\n/)[0]?.trim()
                || el.id;
            items.push({ id: el.id, display, title, type: 'block' });
        });
        return items;
    }
    function normalizeFormalLinks(currentFilePath) {
        document.querySelectorAll('.formal-ref').forEach(anchor => {
            const original = anchor.getAttribute('data-formal-target') || anchor.getAttribute('data-href') || anchor.getAttribute('href') || '';
            if (!original)
                return;
            anchor.setAttribute('data-formal-target', original);
            const target = splitTargetUrl(original, currentFilePath);
            if (!target.targetId)
                return;
            if (target.filePath === currentFilePath) {
                anchor.setAttribute('href', `#${target.targetId}`);
                anchor.setAttribute('data-href', `#${target.targetId}`);
            }
            else {
                const href = `${target.filePath}#${target.targetId}`;
                anchor.setAttribute('href', href);
                anchor.setAttribute('data-href', href);
            }
        });
    }
    function updateBackButton(backBtn) {
        const hasHistory = readHistory().length > 0;
        backBtn.disabled = !hasHistory;
        backBtn.classList.toggle('formal-btn-disabled', !hasHistory);
    }
    function renderNav(currentFilePath, tocItems, chapters, definitions, symbols, config) {
        document.getElementById('formal-nav-bar')?.remove();
        const currentChapter = getCurrentChapter(chapters, currentFilePath);
        const navBar = document.createElement('div');
        navBar.id = 'formal-nav-bar';
        navBar.className = 'formal-nav-bar';
        const backBtn = document.createElement('button');
        backBtn.type = 'button';
        backBtn.className = 'formal-nav-btn formal-back-btn';
        backBtn.textContent = `← ${uiText(config, 'back')}`;
        updateBackButton(backBtn);
        backBtn.addEventListener('click', () => {
            const history = readHistory();
            const last = history.pop();
            writeHistory(history);
            updateBackButton(backBtn);
            if (!last)
                return;
            if (!last.filePath || last.filePath === currentFilePath) {
                restoreHistoryEntry(last, 'smooth');
                return;
            }
            navigateToFile(last.filePath, {
                scroll: last.scroll,
                anchorId: last.anchorId,
                anchorOffset: last.anchorOffset,
                history
            });
        });
        navBar.appendChild(backBtn);
        const chapterContainer = document.createElement('div');
        chapterContainer.className = 'formal-nav-chapter-container';
        const chapterBtn = document.createElement('button');
        chapterBtn.type = 'button';
        chapterBtn.className = 'formal-nav-btn formal-chapter-btn';
        chapterBtn.textContent = currentChapter ? getUnitDisplayTitle(currentChapter, config) : uiText(config, 'units');
        chapterContainer.appendChild(chapterBtn);
        const chapterMenu = document.createElement('div');
        chapterMenu.className = 'formal-nav-chapter-menu';
        const renderChapterLink = (chapter) => {
            const link = document.createElement('a');
            link.className = 'formal-chapter-item';
            if (chapter.unitKind === 'appendix') {
                link.classList.add('formal-appendix-item');
            }
            if (chapter.unitKind === 'intro' || chapter.unitKind === 'summary') {
                link.classList.add('formal-page-item');
            }
            if (chapter.filePath === currentFilePath) {
                link.classList.add('formal-chapter-current');
            }
            link.href = chapter.targetId ? `${chapter.filePath}#${chapter.targetId}` : chapter.filePath;
            const number = document.createElement('span');
            number.className = 'formal-chapter-number';
            number.textContent = getUnitBadge(chapter, config);
            const title = document.createElement('span');
            title.className = 'formal-chapter-title';
            title.textContent = chapter.title;
            link.append(number, title);
            return link;
        };
        const hasVolumeNav = chapters.some(chapter => chapter.hasVolume);
        if (hasVolumeNav) {
            groupChaptersByVolume(chapters).forEach(group => {
                const volumeGroup = document.createElement('div');
                volumeGroup.className = 'formal-chapter-volume';
                const volumeTitle = document.createElement('div');
                volumeTitle.className = 'formal-chapter-volume-title';
                volumeTitle.textContent = group.title;
                const volumeItems = document.createElement('div');
                volumeItems.className = 'formal-chapter-volume-items';
                group.chapters.forEach(chapter => volumeItems.appendChild(renderChapterLink(chapter)));
                volumeGroup.append(volumeTitle, volumeItems);
                chapterMenu.appendChild(volumeGroup);
            });
        }
        else {
            chapters.forEach(chapter => {
                chapterMenu.appendChild(renderChapterLink(chapter));
            });
        }
        chapterContainer.appendChild(chapterMenu);
        navBar.appendChild(chapterContainer);
        const tocContainer = document.createElement('div');
        tocContainer.className = 'formal-nav-toc-container';
        const tocBtn = document.createElement('button');
        tocBtn.type = 'button';
        tocBtn.className = 'formal-nav-btn formal-toc-btn';
        tocBtn.textContent = `☰ ${uiText(config, 'toc')}`;
        tocContainer.appendChild(tocBtn);
        const tocMenu = document.createElement('div');
        tocMenu.className = 'formal-nav-toc-menu';
        tocItems.forEach(item => {
            const link = document.createElement('a');
            link.className = `formal-toc-item ${item.type === 'section' ? 'formal-toc-section' : 'formal-toc-block'}`;
            link.href = `#${item.id}`;
            if (item.display) {
                const display = document.createElement('span');
                display.className = 'formal-toc-display';
                display.textContent = item.display;
                link.appendChild(display);
            }
            const title = document.createElement('span');
            title.className = 'formal-toc-title';
            title.textContent = item.title || item.display || item.id;
            link.appendChild(title);
            tocMenu.appendChild(link);
        });
        if (tocItems.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'formal-toc-empty';
            empty.textContent = uiText(config, 'emptyToc');
            tocMenu.appendChild(empty);
        }
        tocContainer.appendChild(tocMenu);
        navBar.appendChild(tocContainer);
        if (definitions.length > 0 || symbols.length > 0) {
            const definitionContainer = document.createElement('div');
            definitionContainer.className = 'formal-definition-search-container';
            const definitionInput = document.createElement('input');
            definitionInput.type = 'search';
            definitionInput.className = 'formal-definition-search-input';
            definitionInput.placeholder = uiText(config, 'definitionSearchPlaceholder');
            definitionInput.setAttribute('aria-label', uiText(config, 'definitionSearch'));
            const definitionPanel = document.createElement('div');
            definitionPanel.className = 'formal-definition-search-menu';
            definitionInput.addEventListener('input', () => {
                renderDefinitionSearchResults(definitionPanel, definitions, symbols, definitionInput.value, currentFilePath, config);
            });
            definitionInput.addEventListener('focus', () => {
                renderDefinitionSearchResults(definitionPanel, definitions, symbols, definitionInput.value, currentFilePath, config);
            });
            definitionInput.addEventListener('keydown', event => {
                if (event.key === 'Escape') {
                    definitionPanel.classList.remove('formal-definition-search-open');
                    definitionInput.blur();
                }
            });
            definitionContainer.append(definitionInput, definitionPanel);
            navBar.appendChild(definitionContainer);
        }
        document.body.appendChild(navBar);
    }
    function rebuildNav() {
        formalWindow.__markdownFormalRebuildTimer = undefined;
        const labels = readLabels();
        const pages = readPages();
        const definitions = readDefinitions();
        const symbols = readSymbols();
        const formulas = readFormulas();
        const config = readConfig();
        const currentFilePath = getCurrentFilePath(labels, pages);
        const tocItems = collectTocItems();
        const chapters = collectChapters(labels, pages, currentFilePath, config);
        applyIncomingNavigation();
        const boundFormulaCount = bindSymbolFormulas(symbols, formulas, currentFilePath, config);
        if (tocItems.length === 0 && chapters.length === 0 && definitions.length === 0 && symbols.length === 0 && retryCount < 40) {
            retryCount++;
            scheduleRebuild(75);
            return;
        }
        if (symbols.length > 0 && formulas.length > 0 && boundFormulaCount === 0 && symbolRetryCount < 40) {
            symbolRetryCount++;
            scheduleRebuild(75);
        }
        else {
            symbolRetryCount = 0;
        }
        retryCount = 0;
        const language = getLanguage(config);
        const uiSignature = JSON.stringify(config.ui?.[language] || {});
        const signature = `${language}|${uiSignature}|${currentFilePath}|${tocItems.map(item => `${item.id}:${item.display || ''}:${item.title}`).join('|')}|${chapters.map(item => `${item.bookKey}:${item.volumeKey}:${item.unitKind}:${item.unitKey}:${item.filePath}:${item.title}`).join('|')}|${definitions.map(item => `${item.filePath}:${item.line}:${item.title}`).join('|')}|${symbols.map(item => `${item.pattern}:${item.scope}:${item.source || ''}`).join('|')}|${formulas.map(item => item.latex).join('|')}|${readHistory().length}`;
        if (signature === lastNavSignature && document.getElementById('formal-nav-bar')) {
            normalizeFormalLinks(currentFilePath);
            bindSymbolFormulas(symbols, formulas, currentFilePath, config);
            return;
        }
        lastNavSignature = signature;
        normalizeFormalLinks(currentFilePath);
        renderNav(currentFilePath, tocItems, chapters, definitions, symbols, config);
        bindSymbolFormulas(symbols, formulas, currentFilePath, config);
    }
    function scheduleRebuild(delay = 50) {
        if (formalWindow.__markdownFormalRebuildTimer !== undefined) {
            window.clearTimeout(formalWindow.__markdownFormalRebuildTimer);
        }
        formalWindow.__markdownFormalRebuildTimer = window.setTimeout(rebuildNav, delay);
    }
    function handleFormalClick(event) {
        const target = event.target;
        if (!(target instanceof Element))
            return;
        const ref = target.closest('.formal-ref');
        const toc = target.closest('.formal-toc-item');
        const chapter = target.closest('.formal-chapter-item');
        if (!ref && !toc && !chapter)
            return;
        const labels = readLabels();
        const pages = readPages();
        const currentFilePath = getCurrentFilePath(labels, pages);
        const rawTarget = ref
            ? ref.getAttribute('data-formal-target') || ref.getAttribute('data-href') || ref.getAttribute('href')
            : toc
                ? toc.getAttribute('href')
                : chapter?.getAttribute('href');
        if (!rawTarget)
            return;
        const targetInfo = splitTargetUrl(rawTarget, currentFilePath);
        if (!targetInfo.targetId && !chapter)
            return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        if (!targetInfo.filePath || targetInfo.filePath === currentFilePath) {
            pushHistory(currentFilePath);
            if (targetInfo.targetId) {
                scrollToTarget(targetInfo.targetId);
            }
            else {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
            scheduleRebuild();
            return;
        }
        const history = currentHistoryWithReturn(currentFilePath);
        writeHistory(history);
        const returnTo = history[history.length - 1];
        navigateToFile(targetInfo.filePath, {
            targetId: targetInfo.targetId || undefined,
            returnTo,
            history
        });
    }
    function handleDefinitionContextMenu(event) {
        const target = event.target;
        if (!(target instanceof Element))
            return;
        if (target.closest('#formal-nav-bar, #formal-definition-popover, #formal-definition-selection-action, input, textarea, code, pre'))
            return;
        const selectedText = getSelectedLookupText();
        if (!selectedText)
            return;
        const definitions = readDefinitions();
        if (definitions.length === 0)
            return;
        const labels = readLabels();
        const pages = readPages();
        const config = readConfig();
        const currentFilePath = getCurrentFilePath(labels, pages);
        const results = searchDefinitions(definitions, selectedText, currentFilePath, config, 8);
        if (results.length === 0)
            return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        suppressedSelectionText = normalizeDefinitionQuery(selectedText);
        showDefinitionLookupPopover(selectedText, results, { x: event.clientX, y: event.clientY }, config);
    }
    function handleSymbolClick(event) {
        const target = event.target;
        if (!(target instanceof Element))
            return;
        const formula = target.closest('.formal-symbol-match');
        if (!formula)
            return;
        const index = Number(formula.getAttribute('data-formal-symbol-index'));
        const symbol = readSymbols().find(item => item.index === index);
        if (!symbol)
            return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        showSymbolDetail({
            symbol,
            latex: formula.getAttribute('data-formal-latex') || symbol.pattern,
            captures: decodeCaptures(formula.getAttribute('data-formal-symbol-captures')),
            formulaElement: formula
        }, formula, readConfig());
    }
    function handleDefinitionDismiss(event) {
        const target = event.target;
        if (target instanceof Element && target.closest('#formal-definition-popover'))
            return;
        if (target instanceof Element && target.closest('#formal-definition-selection-action'))
            return;
        removeDefinitionPopover();
    }
    function handleDefinitionKeydown(event) {
        if (event.key === 'Escape') {
            removeDefinitionPopover();
            removeDefinitionSelectionAction();
        }
    }
    function installTooltipAdjustment() {
        document.body.addEventListener('mouseover', event => {
            const target = event.target;
            if (!(target instanceof Element))
                return;
            const wrap = target.closest('.formal-ref-wrap');
            if (wrap)
                positionTooltip(wrap);
        });
        document.body.addEventListener('focusin', event => {
            const target = event.target;
            if (!(target instanceof Element))
                return;
            const wrap = target.closest('.formal-ref-wrap');
            if (wrap)
                positionTooltip(wrap);
        });
        window.addEventListener('resize', () => {
            document.querySelectorAll('.formal-ref-wrap:hover, .formal-ref-wrap:focus-within').forEach(positionTooltip);
        });
        window.addEventListener('scroll', () => {
            document.querySelectorAll('.formal-ref-wrap:hover, .formal-ref-wrap:focus-within').forEach(positionTooltip);
        }, true);
    }
    function installOnce() {
        if (formalWindow.__markdownFormalInstalled) {
            scheduleRebuild();
            return;
        }
        formalWindow.__markdownFormalInstalled = true;
        document.body.addEventListener('click', handleFormalClick, true);
        document.body.addEventListener('click', handleSymbolClick, true);
        document.body.addEventListener('contextmenu', handleDefinitionContextMenu, true);
        document.body.addEventListener('click', handleDefinitionDismiss);
        document.body.addEventListener('mouseup', scheduleDefinitionSelectionAction, true);
        document.addEventListener('keydown', handleDefinitionKeydown, true);
        document.addEventListener('keyup', scheduleDefinitionSelectionAction, true);
        document.addEventListener('selectionchange', scheduleDefinitionSelectionAction);
        installTooltipAdjustment();
        const observer = new MutationObserver(mutations => {
            const onlyNavChanged = mutations.every(mutation => {
                const nodes = [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)];
                return nodes.length > 0 && nodes.every(node => node instanceof HTMLElement && node.id === 'formal-nav-bar');
            });
            if (!onlyNavChanged)
                scheduleRebuild();
        });
        observer.observe(document.body, { childList: true, subtree: true });
        scheduleRebuild();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', installOnce);
    }
    else {
        installOnce();
    }
})();
