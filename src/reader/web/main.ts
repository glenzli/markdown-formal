import './styles.css';
import {
    createFormalRenderer,
    renderFormalInline,
    renderFormalMarkdown,
    type ReaderLabel,
    type ReaderPage
} from './formal-renderer';

type Language = 'zh' | 'en';

interface DefinitionSummary {
    index: number;
    title: string;
    aliases?: string[];
    filePath: string;
    line: number;
}

interface ReaderState {
    revision: number;
    rootName: string;
    language: Language;
    pages: ReaderPage[];
    definitions: DefinitionSummary[];
    issues: Array<{ severity: string; code: string; message: string }>;
    dependencySummary: Record<string, number>;
}

interface ReaderPagePayload {
    revision: number;
    filePath: string;
    page?: ReaderPage;
    content: string;
    labels: Record<string, ReaderLabel>;
    symbols: Array<{
        index: number;
        pattern: string;
        display: string;
        meaning: string;
        sourceFilePath?: string;
        sourceLine?: number;
    }>;
}

const words = {
    zh: {
        contents: '目录',
        definitions: '定义',
        symbols: '符号',
        graph: '依赖',
        back: '返回',
        forward: '前进',
        search: '筛选章节',
        searchDefinitions: '搜索定义',
        noDefinitions: '没有匹配的定义',
        noSymbols: '当前页没有已索引的项目符号',
        source: '来源',
        jump: '定位',
        recall: '引用回溯',
        live: '实时同步',
        noContents: '当前页面没有标题',
        close: '关闭'
    },
    en: {
        contents: 'Contents',
        definitions: 'Definitions',
        symbols: 'Symbols',
        graph: 'Dependencies',
        back: 'Back',
        forward: 'Forward',
        search: 'Filter pages',
        searchDefinitions: 'Search definitions',
        noDefinitions: 'No matching definitions',
        noSymbols: 'No indexed project notation occurs on this page',
        source: 'Source',
        jump: 'Locate',
        recall: 'Recall',
        live: 'Live',
        noContents: 'No headings on this page',
        close: 'Close'
    }
} as const;

function escapeHtml(value: string): string {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function queryPath(): string {
    return new URLSearchParams(window.location.search).get('path') || '';
}

function normalizeQuery(value: string): string {
    return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
}

class ReaderApplication {
    private readonly root = document.getElementById('reader-app') as HTMLElement;
    private readonly markdown = createFormalRenderer();
    private state: ReaderState | undefined;
    private page: ReaderPagePayload | undefined;
    private currentPath = '';
    private historyPaths: string[] = [];
    private historyIndex = -1;
    private pageRequestId = 0;
    private main!: HTMLElement;
    private article!: HTMLElement;
    private inspector!: HTMLElement;
    private pageTitle!: HTMLElement;
    private liveStatus!: HTMLElement;
    private recallTimer: number | undefined;

    async start(): Promise<void> {
        this.buildShell();
        await this.refreshState();
        const initialPath = queryPath() || this.state?.pages[0]?.filePath || '';
        if (!initialPath) {
            this.article.textContent = 'No Markdown pages were found in the bound project.';
            return;
        }
        await this.openPage(initialPath, 'replace');
        this.installHandlers();
        this.installRealtimeUpdates();
    }

    private buildShell(): void {
        this.root.innerHTML = [
            '<div class="reader-shell">',
            '<aside class="reader-sidebar" aria-label="Project navigation">',
            '<div class="reader-brand"><span class="reader-brand-mark">M</span><div><strong>Markdown Formal</strong><span id="reader-project-name"></span></div></div>',
            '<label class="reader-filter"><span class="sr-only">Filter pages</span><input id="reader-page-filter" type="search" autocomplete="off" /></label>',
            '<nav id="reader-page-nav" class="reader-page-nav"></nav>',
            '</aside>',
            '<main id="reader-main" class="reader-main">',
            '<header class="reader-toolbar">',
            '<div class="reader-history"><button id="reader-back" class="icon-button" title="Back" aria-label="Back">‹</button><button id="reader-forward" class="icon-button" title="Forward" aria-label="Forward">›</button></div>',
            '<div id="reader-page-title" class="reader-page-title"></div>',
            '<div class="reader-tools"><button class="tool-button" data-inspector="contents" title="Contents">☰</button><button class="tool-button" data-inspector="definitions" title="Definitions">⌕</button><button class="tool-button" data-inspector="symbols" title="Symbols">Σ</button><button class="tool-button" data-inspector="graph" title="Dependencies">⌘</button></div>',
            '<span id="reader-live" class="reader-live" aria-live="polite"></span>',
            '</header><article id="reader-article" class="reader-article"></article></main>',
            '<aside id="reader-inspector" class="reader-inspector" aria-live="polite"></aside>',
            '</div>'
        ].join('');
        this.main = this.root.querySelector('#reader-main') as HTMLElement;
        this.article = this.root.querySelector('#reader-article') as HTMLElement;
        this.inspector = this.root.querySelector('#reader-inspector') as HTMLElement;
        this.pageTitle = this.root.querySelector('#reader-page-title') as HTMLElement;
        this.liveStatus = this.root.querySelector('#reader-live') as HTMLElement;
        (this.root.querySelector('#reader-page-filter') as HTMLInputElement).addEventListener('input', event => {
            this.renderNavigation((event.target as HTMLInputElement).value);
        });
    }

    private dictionary() {
        return words[this.state?.language || 'zh'];
    }

    private async fetchJson<T>(url: string): Promise<T> {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error(await response.text());
        return response.json() as Promise<T>;
    }

    private async refreshState(): Promise<void> {
        this.state = await this.fetchJson<ReaderState>('/api/state');
        const dictionary = this.dictionary();
        (this.root.querySelector('#reader-project-name') as HTMLElement).textContent = this.state.rootName;
        (this.root.querySelector('#reader-page-filter') as HTMLInputElement).placeholder = dictionary.search;
        this.renderNavigation((this.root.querySelector('#reader-page-filter') as HTMLInputElement).value);
        this.updateToolbarLabels();
    }

    private updateToolbarLabels(): void {
        const dictionary = this.dictionary();
        const back = this.root.querySelector('#reader-back') as HTMLElement;
        const forward = this.root.querySelector('#reader-forward') as HTMLElement;
        back.title = dictionary.back;
        back.setAttribute('aria-label', dictionary.back);
        forward.title = dictionary.forward;
        forward.setAttribute('aria-label', dictionary.forward);
        this.root.querySelectorAll<HTMLElement>('[data-inspector]').forEach(button => {
            const view = button.dataset.inspector as keyof typeof dictionary;
            button.title = dictionary[view] || '';
            button.setAttribute('aria-label', dictionary[view] || '');
        });
    }

    private renderNavigation(query = ''): void {
        if (!this.state) return;
        const normalized = normalizeQuery(query);
        const groups = new Map<string, ReaderPage[]>();
        this.state.pages.filter(page => (
            !normalized || normalizeQuery((page.displayHeading || page.title) + ' ' + page.filePath).includes(normalized)
        )).forEach(page => {
            const data = page as ReaderPage & { bookTitle?: string; bookKey?: string; volumeTitle?: string };
            const book = data.bookTitle || data.bookKey || this.state?.rootName || '';
            const groupName = data.volumeTitle ? book + ' · ' + data.volumeTitle : book;
            if (!groups.has(groupName)) groups.set(groupName, []);
            groups.get(groupName)?.push(page);
        });

        const navigation = this.root.querySelector('#reader-page-nav') as HTMLElement;
        navigation.replaceChildren();
        groups.forEach((pages, groupName) => {
            const group = document.createElement('section');
            group.className = 'reader-nav-group';
            const heading = document.createElement('h2');
            heading.textContent = groupName;
            group.append(heading);
            pages.forEach(page => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'reader-nav-page' + (page.filePath === this.currentPath ? ' is-active' : '');
                button.dataset.pagePath = page.filePath;
                button.innerHTML = renderFormalInline(this.markdown, page.displayHeading || page.title, this.renderOptions(page.filePath, {}));
                group.append(button);
            });
            navigation.append(group);
        });
    }

    private async openPage(filePath: string, historyMode: 'push' | 'replace' | 'pop', anchor = '', preserveScroll = false): Promise<void> {
        if (!this.state || !this.state.pages.some(page => page.filePath === filePath)) return;
        const requestId = ++this.pageRequestId;
        const previousScroll = this.main.scrollTop;
        this.article.classList.add('is-loading');
        try {
            const page = await this.fetchJson<ReaderPagePayload>('/api/page?path=' + encodeURIComponent(filePath));
            if (requestId !== this.pageRequestId) return;
            this.page = page;
            this.currentPath = filePath;
            this.updateHistory(filePath, historyMode);
            this.renderNavigation((this.root.querySelector('#reader-page-filter') as HTMLInputElement).value);
            this.renderArticle();
            if (anchor) {
                window.requestAnimationFrame(() => this.scrollToAnchor(anchor));
            } else {
                this.main.scrollTop = preserveScroll ? previousScroll : 0;
            }
        } finally {
            if (requestId === this.pageRequestId) this.article.classList.remove('is-loading');
        }
    }

    private updateHistory(filePath: string, mode: 'push' | 'replace' | 'pop'): void {
        if (mode === 'push' && this.historyPaths[this.historyIndex] !== filePath) {
            this.historyPaths = this.historyPaths.slice(0, this.historyIndex + 1);
            this.historyPaths.push(filePath);
            this.historyIndex = this.historyPaths.length - 1;
            history.pushState({ filePath }, '', '?path=' + encodeURIComponent(filePath));
        } else if (mode === 'replace') {
            if (this.historyIndex < 0) {
                this.historyPaths = [filePath];
                this.historyIndex = 0;
            } else {
                this.historyPaths[this.historyIndex] = filePath;
            }
            history.replaceState({ filePath }, '', '?path=' + encodeURIComponent(filePath));
        }
        (this.root.querySelector('#reader-back') as HTMLButtonElement).disabled = this.historyIndex <= 0;
        (this.root.querySelector('#reader-forward') as HTMLButtonElement).disabled = this.historyIndex >= this.historyPaths.length - 1;
    }

    private renderArticle(): void {
        if (!this.page || !this.state) return;
        const title = this.page.page?.displayHeading || this.page.page?.title || this.page.filePath;
        this.pageTitle.innerHTML = renderFormalInline(this.markdown, title, this.renderOptions(this.page.filePath, this.page.labels));
        document.title = title + ' — Markdown Formal';
        this.article.innerHTML = renderFormalMarkdown(this.markdown, this.page.content, {
            currentFilePath: this.page.filePath,
            labels: this.page.labels,
            pages: this.state.pages,
            language: this.state.language
        });
        this.article.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((heading, index) => {
            if (!heading.id) heading.id = 'reader-heading-' + index;
        });
    }

    private scrollToAnchor(anchor: string): void {
        const id = anchor.replace(/^#/, '');
        const target = this.article.querySelector('#' + CSS.escape(id));
        target?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }

    private navigateHistory(direction: -1 | 1): void {
        const index = this.historyIndex + direction;
        if (index < 0 || index >= this.historyPaths.length) return;
        this.historyIndex = index;
        const path = this.historyPaths[index];
        history.replaceState({ filePath: path }, '', '?path=' + encodeURIComponent(path));
        void this.openPage(path, 'pop');
    }

    private inspectorHeader(title: string): HTMLElement {
        const header = document.createElement('header');
        header.className = 'inspector-header';
        const heading = document.createElement('h2');
        heading.textContent = title;
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'icon-button';
        close.title = this.dictionary().close;
        close.textContent = '×';
        close.addEventListener('click', () => this.closeInspector());
        header.append(heading, close);
        return header;
    }

    private closeInspector(): void {
        this.inspector.classList.remove('is-open');
        this.root.querySelectorAll('[data-inspector]').forEach(button => button.classList.remove('is-active'));
    }

    private async openInspector(view: string): Promise<void> {
        if (!this.state) return;
        this.inspector.classList.add('is-open');
        this.root.querySelectorAll<HTMLElement>('[data-inspector]').forEach(button => {
            button.classList.toggle('is-active', button.dataset.inspector === view);
        });
        if (view === 'contents') this.renderContents();
        if (view === 'definitions') this.renderDefinitions();
        if (view === 'symbols') this.renderSymbols();
        if (view === 'graph') await this.renderGraph();
    }

    private renderContents(): void {
        this.inspector.replaceChildren(this.inspectorHeader(this.dictionary().contents));
        const headings = Array.from(this.article.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'));
        if (headings.length === 0) {
            this.inspector.append(this.emptyState(this.dictionary().noContents));
            return;
        }
        const list = document.createElement('div');
        list.className = 'inspector-list';
        headings.forEach(heading => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'inspector-outline level-' + heading.tagName.slice(1);
            button.textContent = heading.textContent || '';
            button.addEventListener('click', () => heading.scrollIntoView({ behavior: 'smooth', block: 'start' }));
            list.append(button);
        });
        this.inspector.append(list);
    }

    private renderDefinitions(query = ''): void {
        if (!this.state) return;
        this.inspector.replaceChildren(this.inspectorHeader(this.dictionary().definitions));
        const search = document.createElement('input');
        search.type = 'search';
        search.className = 'inspector-search';
        search.placeholder = this.dictionary().searchDefinitions;
        search.value = query;
        search.addEventListener('input', () => this.renderDefinitions(search.value));
        this.inspector.append(search);

        const normalized = normalizeQuery(query);
        const matches = this.state.definitions.filter(definition => (
            !normalized || [definition.title, ...(definition.aliases || [])].map(normalizeQuery).some(value => value.includes(normalized))
        ));
        if (matches.length === 0) {
            this.inspector.append(this.emptyState(this.dictionary().noDefinitions));
            return;
        }
        const list = document.createElement('div');
        list.className = 'inspector-list';
        matches.forEach(definition => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'inspector-entry';
            const title = document.createElement('strong');
            title.textContent = definition.title;
            const location = document.createElement('span');
            location.textContent = definition.filePath + ':' + definition.line;
            button.append(title, location);
            button.addEventListener('click', () => void this.showDefinition(definition.index));
            list.append(button);
        });
        this.inspector.append(list);
    }

    private async showDefinition(index: number): Promise<void> {
        const definition = await this.fetchJson<any>('/api/definition?index=' + index);
        this.inspector.replaceChildren(this.inspectorHeader(definition.title));
        const location = document.createElement('p');
        location.className = 'inspector-location';
        location.textContent = definition.filePath + ':' + definition.line;
        const content = document.createElement('div');
        content.className = 'inspector-content';
        content.innerHTML = renderFormalMarkdown(this.markdown, definition.content || '', this.renderOptions(definition.filePath, definition.labels || {}));
        const locate = document.createElement('button');
        locate.type = 'button';
        locate.className = 'inspect-command';
        locate.textContent = this.dictionary().jump;
        locate.addEventListener('click', () => void this.openPage(definition.filePath, 'push').then(() => {
            this.article.querySelector<HTMLElement>('[data-source-line="' + definition.line + '"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }));
        this.inspector.append(location, content, locate);
    }

    private renderSymbols(): void {
        this.inspector.replaceChildren(this.inspectorHeader(this.dictionary().symbols));
        const symbols = this.page?.symbols || [];
        if (symbols.length === 0) {
            this.inspector.append(this.emptyState(this.dictionary().noSymbols));
            return;
        }
        const grid = document.createElement('div');
        grid.className = 'symbol-grid';
        symbols.forEach(symbol => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'symbol-chip';
            button.innerHTML = renderFormalInline(this.markdown, symbol.display, this.renderOptions(this.currentPath));
            button.addEventListener('click', () => this.showSymbol(symbol));
            grid.append(button);
        });
        this.inspector.append(grid);
        this.showSymbol(symbols[0]);
    }

    private showSymbol(symbol: ReaderPagePayload['symbols'][number]): void {
        this.inspector.querySelector('.symbol-detail')?.remove();
        const detail = document.createElement('section');
        detail.className = 'symbol-detail';
        const display = document.createElement('div');
        display.className = 'symbol-detail-display';
        display.innerHTML = renderFormalInline(this.markdown, symbol.display, this.renderOptions(this.currentPath));
        const meaning = document.createElement('div');
        meaning.className = 'symbol-detail-meaning';
        meaning.innerHTML = renderFormalMarkdown(this.markdown, symbol.meaning, this.renderOptions(this.currentPath));
        detail.append(display, meaning);
        if (symbol.sourceFilePath && symbol.sourceLine) {
            const locate = document.createElement('button');
            locate.type = 'button';
            locate.className = 'inspect-command';
            locate.textContent = this.dictionary().source + ': ' + symbol.sourceFilePath + ':' + symbol.sourceLine;
            locate.addEventListener('click', () => void this.openPage(symbol.sourceFilePath as string, 'push').then(() => {
                this.article.querySelector<HTMLElement>('[data-source-line="' + symbol.sourceLine + '"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }));
            detail.append(locate);
        }
        this.inspector.append(detail);
    }

    private async renderGraph(): Promise<void> {
        const graph = await this.fetchJson<any>('/api/graph');
        this.inspector.replaceChildren(this.inspectorHeader(this.dictionary().graph));
        const summary = document.createElement('section');
        summary.className = 'graph-summary';
        [
            ['Nodes', graph.summary?.nodes || 0],
            ['Edges', graph.summary?.edges || 0],
            ['Proof', graph.summary?.proofEdges || 0],
            ['Cross chapter', graph.summary?.crossChapterEdges || 0],
            ['Cycles', graph.summary?.cycles || 0]
        ].forEach(entry => {
            const row = document.createElement('div');
            const label = document.createElement('span');
            const value = document.createElement('strong');
            label.textContent = String(entry[0]);
            value.textContent = String(entry[1]);
            row.append(label, value);
            summary.append(row);
        });
        this.inspector.append(summary);
    }

    private emptyState(value: string): HTMLElement {
        const element = document.createElement('p');
        element.className = 'inspector-empty';
        element.textContent = value;
        return element;
    }

    private renderOptions(currentFilePath: string, labels = this.page?.labels || {}) {
        return {
            currentFilePath,
            labels,
            pages: this.state?.pages || [],
            language: this.state?.language || 'zh'
        } as const;
    }

    private async showRecall(id: string): Promise<void> {
        if (!this.state) return;
        try {
            const recall = await this.fetchJson<any>('/api/recall?id=' + encodeURIComponent(id));
            this.inspector.classList.add('is-open');
            this.inspector.replaceChildren(this.inspectorHeader(this.dictionary().recall));
            const title = document.createElement('p');
            title.className = 'inspector-location';
            title.textContent = recall.display || recall.title;
            const content = document.createElement('div');
            content.className = 'inspector-content';
            content.innerHTML = renderFormalMarkdown(this.markdown, recall.content || '', this.renderOptions(recall.filePath, recall.labels || {}));
            this.inspector.append(title, content);
        } catch (_error) {
            // Sections and non-recallable references remain ordinary links.
        }
    }

    private installHandlers(): void {
        this.root.addEventListener('click', event => {
            const target = event.target as HTMLElement | null;
            if (!target) return;
            const pageButton = target.closest<HTMLElement>('[data-page-path]');
            if (pageButton?.dataset.pagePath) {
                void this.openPage(pageButton.dataset.pagePath, 'push');
                return;
            }
            const inspectorButton = target.closest<HTMLElement>('[data-inspector]');
            if (inspectorButton?.dataset.inspector) {
                void this.openInspector(inspectorButton.dataset.inspector);
                return;
            }
            const link = target.closest<HTMLAnchorElement>('a[data-reader-page], a[data-formal-ref]');
            if (!link) return;
            const filePath = link.dataset.readerPage;
            if (!filePath) return;
            event.preventDefault();
            const anchor = link.hash.replace(/^#/, '');
            if (filePath === this.currentPath && anchor) {
                this.scrollToAnchor(anchor);
                return;
            }
            void this.openPage(filePath, 'push', anchor);
        });
        this.root.addEventListener('mouseover', event => {
            const reference = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>('a[data-formal-ref]');
            if (!reference?.dataset.formalRef) return;
            window.clearTimeout(this.recallTimer);
            this.recallTimer = window.setTimeout(() => void this.showRecall(reference.dataset.formalRef as string), 420);
        });
        this.root.addEventListener('mouseout', event => {
            if (!(event.target as HTMLElement | null)?.closest('a[data-formal-ref]')) return;
            window.clearTimeout(this.recallTimer);
        });
        window.addEventListener('popstate', () => {
            const filePath = queryPath();
            if (filePath) void this.openPage(filePath, 'pop');
        });
        (this.root.querySelector('#reader-back') as HTMLButtonElement).addEventListener('click', () => this.navigateHistory(-1));
        (this.root.querySelector('#reader-forward') as HTMLButtonElement).addEventListener('click', () => this.navigateHistory(1));
    }

    private installRealtimeUpdates(): void {
        const events = new EventSource('/api/events');
        events.addEventListener('workspace-update', event => {
            let changedPaths: string[] = [];
            let revision: number | undefined;
            let initial = false;
            try {
                const update = JSON.parse((event as MessageEvent<string>).data);
                changedPaths = update.changedPaths || [];
                revision = update.revision;
                initial = update.initial === true;
            } catch (_error) {
                // Missing event metadata falls back to a conservative page refresh.
            }
            if (initial && revision === this.state?.revision) return;
            const current = this.currentPath;
            void this.refreshState().then(() => {
                this.liveStatus.textContent = this.dictionary().live;
                window.setTimeout(() => { this.liveStatus.textContent = ''; }, 1200);
                const next = this.state?.pages.some(page => page.filePath === current) ? current : this.state?.pages[0]?.filePath;
                const projectMetadataChanged = changedPaths.some(filePath => (
                    filePath === '.markdown-formal/config.json'
                    || filePath === '.markdown-formal/definitions.json'
                    || filePath === '.markdown-formal/symbols.json'
                ));
                const reloadCurrent = changedPaths.length === 0 || changedPaths.includes(current) || projectMetadataChanged;
                if (next && (next !== current || reloadCurrent)) return this.openPage(next, 'pop', '', next === current);
                return undefined;
            }).catch(error => console.error('[markdown-formal] Reader update failed', error));
        });
    }
}

void new ReaderApplication().start().catch(error => {
    const root = document.getElementById('reader-app');
    if (!root) return;
    const message = error instanceof Error ? error.message : String(error);
    root.innerHTML = '<main class="reader-failure"><h1>Markdown Formal Reader</h1><pre>' + escapeHtml(message) + '</pre></main>';
});
