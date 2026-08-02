import './styles.css';
import {
    createFormalRenderer,
    renderFormalDocument,
    renderFormalInline,
    renderReaderFormula,
    renderFormalMarkdown,
    type ReaderFormula,
    type ReaderLabel,
    type ReaderPage
} from './formal-renderer';
import {
    ReaderSourceActions,
    type ReaderDefinitionMatch
} from './source-actions';
import { ReaderRecallPopover } from './recall-popover';
import { copyReaderText } from './reader-clipboard';
import { readerIcon, replaceReaderButtonIcon, type ReaderIconName } from './reader-icons';
import { ReaderToolbarPanel } from './reader-toolbar-panel';

type Language = 'zh' | 'en';

interface DefinitionSummary {
    index: number;
    title: string;
    aliases?: string[];
    filePath: string;
    line: number;
}

interface ReaderState {
    available?: boolean;
    revision: number;
    rootName: string;
    language: Language;
    pages: ReaderPage[];
    definitions: DefinitionSummary[];
    issues: Array<{ severity: string; code: string; message: string }>;
    recentProjects?: Array<{ index: number; rootName: string; openedAt: string }>;
}

interface ReaderPagePayload {
    revision: number;
    filePath: string;
    page?: ReaderPage;
    content: string;
    labels: Record<string, ReaderLabel>;
    formulas?: ReaderFormula[];
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
        formulas: '公式',
        back: '返回',
        forward: '前进',
        showNavigation: '展开书籍导航',
        hideNavigation: '折叠书籍导航',
        search: '筛选章节',
        searchDefinitions: '搜索定义',
        searchAllDefinitions: '全书检索',
        showChapterDefinitions: '返回本章定义',
        searchFormulas: '搜索当前页公式',
        noDefinitions: '没有匹配的定义',
        noChapterDefinitions: '本章没有提及可检索定义',
        noSymbols: '当前页没有已索引的项目符号',
        noFormulas: '当前页没有可搜索的公式',
        previousPage: '上一页',
        nextPage: '下一页',
        source: '来源',
        jump: '定位',
        recall: '引用回溯',
        live: '实时同步',
        noContents: '当前页面没有标题',
        close: '关闭',
        copyLatex: '复制 LaTeX',
        copySelectedMarkdown: '复制选中 Markdown',
        copySourceLines: '复制所在行 Markdown',
        lookupDefinition: '查定义',
        copied: '已复制',
        refineDefinitionQuery: '请选择完整的术语',
        decreaseFont: '减小字号',
        increaseFont: '增大字号',
        fontSize: '正文大小',
        chooseProject: '选择项目目录',
        recentProjects: '最近打开的项目',
        noRecentProjects: '还没有最近打开的项目。',
        projectLauncherTitle: '打开 Markdown Formal 项目',
        projectLauncherDescription: '选择一个已包含 .markdown-formal/config.json 的项目目录。',
        projectSelectionCancelled: '尚未选择项目。'
    },
    en: {
        contents: 'Contents',
        definitions: 'Definitions',
        symbols: 'Symbols',
        formulas: 'Formulas',
        back: 'Back',
        forward: 'Forward',
        showNavigation: 'Show book navigation',
        hideNavigation: 'Hide book navigation',
        search: 'Filter pages',
        searchDefinitions: 'Search definitions',
        searchAllDefinitions: 'Search all definitions',
        showChapterDefinitions: 'Back to chapter definitions',
        searchFormulas: 'Search formulas on this page',
        noDefinitions: 'No matching definitions',
        noChapterDefinitions: 'No indexed definitions are mentioned in this chapter',
        noSymbols: 'No indexed project notation occurs on this page',
        noFormulas: 'No searchable formulas occur on this page',
        previousPage: 'Previous page',
        nextPage: 'Next page',
        source: 'Source',
        jump: 'Locate',
        recall: 'Recall',
        live: 'Live',
        noContents: 'No headings on this page',
        close: 'Close',
        copyLatex: 'Copy LaTeX',
        copySelectedMarkdown: 'Copy selected Markdown',
        copySourceLines: 'Copy source lines',
        lookupDefinition: 'Find definition',
        copied: 'Copied',
        refineDefinitionQuery: 'Select a fuller term',
        decreaseFont: 'Decrease text size',
        increaseFont: 'Increase text size',
        fontSize: 'Text size',
        chooseProject: 'Choose project folder',
        recentProjects: 'Recent projects',
        noRecentProjects: 'No recent projects yet.',
        projectLauncherTitle: 'Open a Markdown Formal project',
        projectLauncherDescription: 'Choose a project folder containing .markdown-formal/config.json.',
        projectSelectionCancelled: 'No project was selected.'
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

const DEFAULT_FONT_SIZE = 14;
const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 24;
const FONT_SIZE_STORAGE_KEY = 'markdown-formal.reader.font-size';
const NAVIGATION_STORAGE_KEY = 'markdown-formal.reader.navigation-collapsed';

function storedFontSize(): number {
    try {
        const value = Number.parseInt(localStorage.getItem(FONT_SIZE_STORAGE_KEY) || '', 10);
        return Number.isInteger(value) ? Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, value)) : DEFAULT_FONT_SIZE;
    } catch (_error) {
        return DEFAULT_FONT_SIZE;
    }
}

function storedNavigationCollapsed(): boolean {
    try {
        return localStorage.getItem(NAVIGATION_STORAGE_KEY) === 'true';
    } catch (_error) {
        return false;
    }
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
    private fontSize = storedFontSize();
    private navigationCollapsed = storedNavigationCollapsed();
    private main!: HTMLElement;
    private article!: HTMLElement;
    private pageTitle!: HTMLElement;
    private liveStatus!: HTMLElement;
    private sourceActions!: ReaderSourceActions;
    private recallPopover!: ReaderRecallPopover;
    private toolbarPanel!: ReaderToolbarPanel;
    private realtimeEvents: EventSource | undefined;

    async start(): Promise<void> {
        this.buildShell();
        await this.refreshState();
        this.installHandlers();
        if (!this.state?.available) {
            this.renderProjectLauncher();
            return;
        }
        await this.openInitialPage();
        this.installRealtimeUpdates();
    }

    private async openInitialPage(): Promise<void> {
        const initialPath = queryPath() || this.state?.pages[0]?.filePath || '';
        if (!initialPath) {
            this.article.textContent = 'No Markdown pages were found in the bound project.';
            return;
        }
        await this.openPage(initialPath, 'replace');
    }

    private buildShell(): void {
        this.root.innerHTML = [
            '<div class="reader-shell' + (this.navigationCollapsed ? ' is-navigation-collapsed' : '') + '">',
            '<aside id="reader-sidebar" class="reader-sidebar" aria-label="Project navigation">',
            '<div class="reader-brand"><span class="reader-brand-mark">MF</span><div><strong>Markdown Formal</strong><span id="reader-project-name"></span></div></div>',
            '<label class="reader-filter"><span class="sr-only">Filter pages</span><input id="reader-page-filter" type="search" autocomplete="off" /></label>',
            '<nav id="reader-page-nav" class="reader-page-nav"></nav>',
            '</aside>',
            '<main id="reader-main" class="reader-main">',
            '<header class="reader-toolbar">',
            '<button id="reader-navigation-toggle" class="icon-button reader-navigation-toggle" type="button"></button>',
            '<div class="reader-history"><button id="reader-back" class="icon-button" aria-label="Back"></button><button id="reader-forward" class="icon-button" aria-label="Forward"></button></div>',
            '<div id="reader-page-title" class="reader-page-title"></div>',
            '<div class="reader-tools"><button class="tool-button" data-panel="contents" aria-label="Contents"></button><button class="tool-button" data-panel="definitions" aria-label="Definitions"></button><button class="tool-button" data-panel="symbols" aria-label="Symbols"></button><button class="tool-button" data-panel="formulas" aria-label="Formulas"></button></div>',
            '<div class="reader-type-control"><button type="button" class="type-size-button" data-font-size="-1" aria-label="Decrease text size">A−</button><output id="reader-font-size" aria-live="polite">' + this.fontSize + 'px</output><button type="button" class="type-size-button" data-font-size="1" aria-label="Increase text size">A+</button></div>',
            '<span id="reader-live" class="reader-live" aria-live="polite"></span>',
            '</header><article id="reader-article" class="reader-article"></article></main>',
            '</div>'
        ].join('');
        this.main = this.root.querySelector('#reader-main') as HTMLElement;
        this.article = this.root.querySelector('#reader-article') as HTMLElement;
        this.pageTitle = this.root.querySelector('#reader-page-title') as HTMLElement;
        this.liveStatus = this.root.querySelector('#reader-live') as HTMLElement;
        this.installToolbarIcons();
        this.updateFontSize(this.fontSize, false);
        (this.root.querySelector('#reader-page-filter') as HTMLInputElement).addEventListener('input', event => {
            this.renderNavigation((event.target as HTMLInputElement).value);
        });
        this.sourceActions = new ReaderSourceActions({
            getDefinitions: query => this.findDefinitions(query, 7),
            fetchDefinition: index => this.fetchJson<any>('/api/definition?index=' + index),
            renderDefinition: definition => this.renderDefinitionContent(definition),
            locateDefinition: definition => this.locateDefinition(definition),
            labels: () => {
                const dictionary = this.dictionary();
                return {
                    copyLatex: dictionary.copyLatex,
                    copySelectedMarkdown: dictionary.copySelectedMarkdown,
                    copySourceLines: dictionary.copySourceLines,
                    lookupDefinition: dictionary.lookupDefinition,
                    locate: dictionary.jump,
                    copied: dictionary.copied,
                    noDefinitions: dictionary.noDefinitions,
                    refineDefinitionQuery: dictionary.refineDefinitionQuery
                };
            }
        });
        this.recallPopover = new ReaderRecallPopover({
            fetchRecall: id => this.fetchJson<any>('/api/recall?id=' + encodeURIComponent(id)),
            renderRecall: recall => renderFormalMarkdown(this.markdown, recall.content || '', this.renderOptions(recall.filePath, recall.labels || {})),
            labels: () => ({ recall: this.dictionary().recall })
        });
        this.toolbarPanel = new ReaderToolbarPanel(() => ({ close: this.dictionary().close }));
    }

    private dictionary() {
        return words[this.state?.language || 'zh'];
    }

    private async fetchJson<T>(url: string): Promise<T> {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error(await response.text());
        return response.json() as Promise<T>;
    }

    private async postJson<T>(url: string, value: unknown = {}): Promise<T> {
        const response = await fetch(url, {
            method: 'POST',
            cache: 'no-store',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(value)
        });
        if (!response.ok) throw new Error(await response.text());
        return response.json() as Promise<T>;
    }

    private async refreshState(): Promise<void> {
        this.applyState(await this.fetchJson<ReaderState>('/api/state'));
    }

    private applyState(state: ReaderState): void {
        this.state = state;
        const dictionary = this.dictionary();
        (this.root.querySelector('#reader-project-name') as HTMLElement).textContent = this.state.rootName;
        (this.root.querySelector('#reader-page-filter') as HTMLInputElement).placeholder = dictionary.search;
        this.renderNavigation((this.root.querySelector('#reader-page-filter') as HTMLInputElement).value);
        this.updateToolbarLabels();
    }

    private renderProjectLauncher(message = ''): void {
        const shell = this.root.querySelector('.reader-shell') as HTMLElement;
        shell.classList.add('is-project-launcher');
        this.article.replaceChildren();
        const dictionary = this.dictionary();
        const panel = document.createElement('section');
        panel.className = 'reader-project-launcher';
        const title = document.createElement('h1');
        title.textContent = dictionary.projectLauncherTitle;
        const description = document.createElement('p');
        description.textContent = message || dictionary.projectLauncherDescription;
        const choose = document.createElement('button');
        choose.type = 'button';
        choose.className = 'reader-project-choose';
        choose.dataset.projectPicker = 'true';
        choose.textContent = dictionary.chooseProject;
        const recentHeading = document.createElement('h2');
        recentHeading.textContent = dictionary.recentProjects;
        const recent = document.createElement('div');
        recent.className = 'reader-recent-projects';
        const projects = this.state?.recentProjects || [];
        if (!projects.length) {
            const empty = document.createElement('p');
            empty.className = 'reader-project-empty';
            empty.textContent = dictionary.noRecentProjects;
            recent.append(empty);
        } else {
            projects.forEach(project => {
                const button = document.createElement('button');
                button.type = 'button';
                button.dataset.recentProject = String(project.index);
                const name = document.createElement('strong');
                name.textContent = project.rootName;
                const opened = document.createElement('span');
                const date = new Date(project.openedAt);
                opened.textContent = Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
                button.append(name, opened);
                recent.append(button);
            });
        }
        panel.append(title, description, choose, recentHeading, recent);
        this.article.append(panel);
    }

    private async chooseProject(url: string, value: unknown = {}): Promise<void> {
        try {
            const state = await this.postJson<ReaderState>(url, value);
            this.applyState(state);
            if (!state.available) {
                this.renderProjectLauncher(this.dictionary().projectSelectionCancelled);
                return;
            }
            this.root.querySelector('.reader-shell')?.classList.remove('is-project-launcher');
            this.page = undefined;
            this.currentPath = '';
            this.historyPaths = [];
            this.historyIndex = -1;
            window.history.replaceState({}, '', window.location.pathname);
            await this.openInitialPage();
            this.installRealtimeUpdates();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.renderProjectLauncher(message);
        }
    }

    private updateToolbarLabels(): void {
        const dictionary = this.dictionary();
        const back = this.root.querySelector('#reader-back') as HTMLElement;
        const forward = this.root.querySelector('#reader-forward') as HTMLElement;
        back.dataset.tooltip = dictionary.back;
        back.setAttribute('aria-label', dictionary.back);
        forward.dataset.tooltip = dictionary.forward;
        forward.setAttribute('aria-label', dictionary.forward);
        this.root.querySelectorAll<HTMLElement>('[data-panel]').forEach(button => {
            const view = button.dataset.panel as keyof typeof dictionary;
            button.dataset.tooltip = dictionary[view] || '';
            button.setAttribute('aria-label', dictionary[view] || '');
        });
        const fontSize = this.root.querySelector('.reader-type-control') as HTMLElement;
        fontSize.setAttribute('aria-label', dictionary.fontSize);
        const decrease = this.root.querySelector<HTMLElement>('[data-font-size="-1"]') as HTMLElement;
        const increase = this.root.querySelector<HTMLElement>('[data-font-size="1"]') as HTMLElement;
        decrease.dataset.tooltip = dictionary.decreaseFont;
        decrease.setAttribute('aria-label', dictionary.decreaseFont);
        increase.dataset.tooltip = dictionary.increaseFont;
        increase.setAttribute('aria-label', dictionary.increaseFont);
        this.updateNavigationToggle();
    }

    private updateFontSize(value: number, persist = true): void {
        this.fontSize = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, value));
        this.root.style.setProperty('--reader-font-size', this.fontSize + 'px');
        const output = this.root.querySelector('#reader-font-size') as HTMLOutputElement | null;
        if (output) output.textContent = this.fontSize + 'px';
        const decrease = this.root.querySelector<HTMLButtonElement>('[data-font-size="-1"]');
        const increase = this.root.querySelector<HTMLButtonElement>('[data-font-size="1"]');
        if (decrease) decrease.disabled = this.fontSize <= MIN_FONT_SIZE;
        if (increase) increase.disabled = this.fontSize >= MAX_FONT_SIZE;
        if (!persist) return;
        try {
            localStorage.setItem(FONT_SIZE_STORAGE_KEY, String(this.fontSize));
        } catch (_error) {
            // A restrictive browser context can disable persistence without affecting reading.
        }
    }

    private setNavigationCollapsed(value: boolean, persist = true): void {
        this.navigationCollapsed = value;
        this.root.querySelector('.reader-shell')?.classList.toggle('is-navigation-collapsed', value);
        this.updateNavigationToggle();
        if (!persist) return;
        try {
            localStorage.setItem(NAVIGATION_STORAGE_KEY, String(value));
        } catch (_error) {
            // Navigation remains usable when browser storage is unavailable.
        }
    }

    private updateNavigationToggle(): void {
        const toggle = this.root.querySelector('#reader-navigation-toggle') as HTMLButtonElement | null;
        if (!toggle) return;
        const label = this.navigationCollapsed ? this.dictionary().showNavigation : this.dictionary().hideNavigation;
        toggle.dataset.tooltip = label;
        toggle.setAttribute('aria-label', label);
        toggle.setAttribute('aria-expanded', String(!this.navigationCollapsed));
        replaceReaderButtonIcon(toggle, this.navigationCollapsed ? 'navigation-open' : 'navigation-close', 18);
    }

    private installToolbarIcons(): void {
        const icons: Array<[string, ReaderIconName]> = [
            ['#reader-back', 'chevron-left'],
            ['#reader-forward', 'chevron-right'],
            ['[data-panel="contents"]', 'contents'],
            ['[data-panel="definitions"]', 'definition'],
            ['[data-panel="symbols"]', 'sigma'],
            ['[data-panel="formulas"]', 'formulas']
        ];
        icons.forEach(([selector, icon]) => {
            const button = this.root.querySelector<HTMLElement>(selector);
            if (button) replaceReaderButtonIcon(button, icon);
        });
        this.updateNavigationToggle();
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
            heading.innerHTML = renderFormalInline(this.markdown, groupName, this.renderOptions('', {}));
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
        this.toolbarPanel.close();
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
        const rendered = renderFormalDocument(this.markdown, this.page.content, {
            currentFilePath: this.page.filePath,
            labels: this.page.labels,
            pages: this.state.pages,
            language: this.state.language
        });
        this.page.formulas = rendered.formulas;
        this.article.innerHTML = rendered.html;
        this.article.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((heading, index) => {
            if (!heading.id) heading.id = 'reader-heading-' + index;
        });
        this.sourceActions.bind(this.article, { source: this.page.content, formulas: rendered.formulas });
        this.recallPopover.bind(this.article);
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

    private openPanel(view: string, trigger: HTMLElement): void {
        if (!this.state) return;
        const dictionary = this.dictionary();
        const title = dictionary[view as keyof typeof dictionary] || view;
        this.toolbarPanel.open(view, trigger, title, content => {
            if (view === 'contents') this.renderContents(content);
            if (view === 'definitions') this.renderDefinitions(content);
            if (view === 'symbols') this.renderSymbols(content);
            if (view === 'formulas') this.renderFormulas(content);
        });
    }

    private renderContents(container: HTMLElement): void {
        const headings = Array.from(this.article.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'));
        if (headings.length === 0) {
            container.append(this.emptyState(this.dictionary().noContents));
            return;
        }
        const list = document.createElement('div');
        list.className = 'reader-panel-list reader-outline-list';
        headings.forEach(heading => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'reader-outline level-' + heading.tagName.slice(1);
            button.innerHTML = heading.innerHTML;
            button.addEventListener('click', () => {
                heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
                this.toolbarPanel.close();
            });
            list.append(button);
        });
        container.append(list);
    }

    private renderDefinitions(container: HTMLElement): void {
        container.replaceChildren();
        let scope: 'chapter' | 'all' = 'chapter';
        const controls = document.createElement('div');
        controls.className = 'reader-definition-controls';
        const search = document.createElement('input');
        search.type = 'search';
        search.className = 'reader-panel-search';
        search.placeholder = this.dictionary().searchDefinitions;
        const scopeButton = document.createElement('button');
        scopeButton.type = 'button';
        scopeButton.className = 'reader-definition-scope';
        const results = document.createElement('div');
        results.className = 'reader-panel-list';
        const renderResults = () => {
            results.replaceChildren();
            scopeButton.textContent = scope === 'chapter'
                ? this.dictionary().searchAllDefinitions
                : this.dictionary().showChapterDefinitions;
            scopeButton.classList.toggle('is-active', scope === 'all');
            const matches = this.findDefinitions(search.value, 80, scope === 'chapter' ? this.chapterDefinitions() : undefined);
            if (matches.length === 0) {
                results.append(this.emptyState(scope === 'chapter' && !search.value.trim()
                    ? this.dictionary().noChapterDefinitions
                    : this.dictionary().noDefinitions));
                return;
            }
            matches.forEach(definition => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'reader-definition-entry';
                const title = document.createElement('strong');
                title.textContent = definition.title;
                button.append(title);
                button.addEventListener('click', () => void this.showDefinition(container, definition.index));
                results.append(button);
            });
            this.toolbarPanel.reposition();
        };
        search.addEventListener('input', renderResults);
        scopeButton.addEventListener('click', () => {
            scope = scope === 'chapter' ? 'all' : 'chapter';
            renderResults();
            search.focus();
        });
        controls.append(search, scopeButton);
        container.append(controls, results);
        renderResults();
        window.requestAnimationFrame(() => search.focus());
    }

    private async showDefinition(container: HTMLElement, index: number): Promise<void> {
        const definition = await this.fetchJson<any>('/api/definition?index=' + index);
        if (!container.isConnected) return;
        container.replaceChildren();
        const header = document.createElement('div');
        header.className = 'reader-detail-header';
        const title = document.createElement('strong');
        title.className = 'reader-detail-title';
        title.textContent = definition.title;
        const actions = document.createElement('div');
        actions.className = 'reader-detail-actions';
        actions.append(
            this.panelIconButton('arrow-left', this.dictionary().definitions, () => this.renderDefinitions(container)),
            this.panelIconButton('locate', this.dictionary().jump, () => {
                this.toolbarPanel.close();
                void this.openPage(definition.filePath, 'push').then(() => {
                    this.article.querySelector<HTMLElement>('[data-source-line="' + definition.line + '"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                });
            })
        );
        const content = document.createElement('div');
        content.className = 'reader-panel-prose';
        content.innerHTML = this.renderDefinitionContent(definition);
        header.append(title, actions);
        container.append(header, content);
        this.toolbarPanel.reposition();
    }

    private chapterDefinitions(): DefinitionSummary[] {
        if (!this.state || !this.page) return [];
        const source = normalizeQuery(this.page.content);
        if (!source) return [];
        return this.state.definitions.filter(definition => (
            [definition.title, ...(definition.aliases || [])].some(name => {
                const normalized = normalizeQuery(name);
                if (!normalized) return false;
                if (/^[a-z0-9 _-]+$/i.test(normalized)) {
                    return new RegExp('(^|[^a-z0-9_])' + normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=$|[^a-z0-9_])', 'i').test(source);
                }
                return source.includes(normalized);
            })
        ));
    }

    private findDefinitions(query: string, limit = Number.POSITIVE_INFINITY, candidates = this.state?.definitions || []): DefinitionSummary[] {
        if (!this.state) return [];
        const normalized = normalizeQuery(query);
        const matches = candidates.filter(definition => (
            !normalized || [definition.title, ...(definition.aliases || [])].map(normalizeQuery).some(value => value.includes(normalized))
        ));
        if (!normalized) return matches.slice(0, limit);
        return matches.sort((left, right) => {
            const leftNames = [left.title, ...(left.aliases || [])].map(normalizeQuery);
            const rightNames = [right.title, ...(right.aliases || [])].map(normalizeQuery);
            const leftExact = leftNames.includes(normalized) ? 0 : 1;
            const rightExact = rightNames.includes(normalized) ? 0 : 1;
            if (leftExact !== rightExact) return leftExact - rightExact;
            const leftLength = Math.min(...leftNames.filter(name => name.includes(normalized)).map(name => name.length));
            const rightLength = Math.min(...rightNames.filter(name => name.includes(normalized)).map(name => name.length));
            return leftLength - rightLength || left.title.localeCompare(right.title);
        }).slice(0, limit);
    }

    private renderDefinitionContent(definition: any): string {
        return renderFormalMarkdown(this.markdown, definition.content || '', this.renderOptions(definition.filePath, definition.labels || {}));
    }

    private locateDefinition(definition: ReaderDefinitionMatch): void {
        void this.openPage(definition.filePath, 'push').then(() => {
            this.article.querySelector<HTMLElement>('[data-source-line="' + definition.line + '"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
    }

    private renderSymbols(container: HTMLElement): void {
        const symbols = this.page?.symbols || [];
        if (symbols.length === 0) {
            container.append(this.emptyState(this.dictionary().noSymbols));
            return;
        }
        const grid = document.createElement('div');
        grid.className = 'reader-symbol-grid';
        const detail = document.createElement('section');
        detail.className = 'reader-symbol-detail';
        const show = (symbol: ReaderPagePayload['symbols'][number]) => {
            detail.replaceChildren();
            const display = document.createElement('div');
            display.className = 'reader-symbol-display';
            display.innerHTML = renderFormalInline(this.markdown, symbol.display, this.renderOptions(this.currentPath));
            const meaning = document.createElement('div');
            meaning.className = 'reader-panel-prose';
            meaning.innerHTML = renderFormalMarkdown(this.markdown, symbol.meaning, this.renderOptions(this.currentPath));
            detail.append(display, meaning);
            if (symbol.sourceFilePath && symbol.sourceLine) {
                detail.append(this.panelIconButton('locate', this.dictionary().jump, () => {
                    this.toolbarPanel.close();
                    void this.openPage(symbol.sourceFilePath as string, 'push').then(() => {
                        this.article.querySelector<HTMLElement>('[data-source-line="' + symbol.sourceLine + '"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    });
                }));
            }
            this.toolbarPanel.reposition();
        };
        symbols.forEach(symbol => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'reader-symbol-chip';
            button.innerHTML = renderFormalInline(this.markdown, symbol.display, this.renderOptions(this.currentPath));
            button.addEventListener('click', () => show(symbol));
            grid.append(button);
        });
        container.append(grid, detail);
        show(symbols[0]);
    }

    private renderFormulas(container: HTMLElement): void {
        const pageSize = 12;
        let pageIndex = 0;
        const search = document.createElement('input');
        search.type = 'search';
        search.className = 'reader-panel-search';
        search.placeholder = this.dictionary().searchFormulas;
        const list = document.createElement('div');
        list.className = 'reader-panel-list reader-formula-list';
        const detail = document.createElement('section');
        detail.className = 'reader-formula-detail';
        const renderResults = () => {
            const normalized = normalizeQuery(search.value).replace(/\s/g, '');
            const formulas = (this.page?.formulas || []).filter(formula => formula.display && (
                !normalized || normalizeQuery(formula.latex).replace(/\s/g, '').includes(normalized)
            ));
            list.replaceChildren();
            if (formulas.length === 0) {
                list.append(this.emptyState(this.dictionary().noFormulas));
                detail.replaceChildren();
                return;
            }
            const pageCount = Math.ceil(formulas.length / pageSize);
            pageIndex = Math.min(pageIndex, pageCount - 1);
            const visibleFormulas = formulas.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
            visibleFormulas.forEach(formula => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'reader-formula-entry';
                button.innerHTML = this.renderFormula(formula);
                button.addEventListener('click', () => {
                    if (!detail.isConnected) list.after(detail);
                    this.showFormulaDetail(detail, formula);
                    this.locateFormula(formula.id);
                });
                list.append(button);
            });
            if (pageCount > 1) {
                const pagination = document.createElement('div');
                pagination.className = 'reader-formula-pagination';
                const previous = this.panelIconButton('chevron-left', this.dictionary().previousPage, () => {
                    pageIndex--;
                    renderResults();
                });
                previous.disabled = pageIndex === 0;
                const status = document.createElement('output');
                status.textContent = this.formatFormulaPage(pageIndex + 1, pageCount, formulas.length);
                const next = this.panelIconButton('chevron-right', this.dictionary().nextPage, () => {
                    pageIndex++;
                    renderResults();
                });
                next.disabled = pageIndex >= pageCount - 1;
                pagination.append(previous, status, next);
                list.append(pagination);
            }
            this.toolbarPanel.reposition();
        };
        search.addEventListener('input', () => {
            pageIndex = 0;
            renderResults();
        });
        container.append(search, list);
        renderResults();
        window.requestAnimationFrame(() => search.focus());
    }

    private formatFormulaPage(page: number, pageCount: number, total: number): string {
        return this.state?.language === 'en'
            ? `Page ${page} / ${pageCount} (${total})`
            : `第 ${page} / ${pageCount} 页 (${total})`;
    }

    private showFormulaDetail(detail: HTMLElement, formula: ReaderFormula): void {
        detail.replaceChildren();
        const actions = document.createElement('div');
        actions.className = 'reader-detail-actions';
        actions.append(
            this.panelIconButton('copy', this.dictionary().copyLatex, button => void this.copyPanelText(button, formula.latex))
        );
        detail.append(actions);
        this.toolbarPanel.reposition();
    }

    private locateFormula(id: string): void {
        const formula = this.article.querySelector<HTMLElement>('[data-reader-formula="' + CSS.escape(id) + '"]');
        if (!formula) return;
        formula.scrollIntoView({ behavior: 'smooth', block: 'center' });
        formula.classList.add('is-highlighted');
        window.setTimeout(() => formula.classList.remove('is-highlighted'), 1500);
    }

    private emptyState(value: string): HTMLElement {
        const element = document.createElement('p');
        element.className = 'reader-panel-empty';
        element.textContent = value;
        return element;
    }

    private renderFormula(formula: ReaderFormula): string {
        return renderReaderFormula(formula);
    }

    private panelIconButton(icon: ReaderIconName, label: string, action: (button: HTMLButtonElement) => void): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'reader-panel-action';
        button.append(readerIcon(icon));
        button.dataset.tooltip = label;
        button.setAttribute('aria-label', label);
        button.addEventListener('click', () => action(button));
        return button;
    }

    private async copyPanelText(button: HTMLButtonElement, value: string): Promise<void> {
        if (!(await copyReaderText(value))) return;
        const label = button.dataset.tooltip || button.getAttribute('aria-label') || '';
        button.classList.add('is-copied');
        button.dataset.tooltip = this.dictionary().copied;
        button.setAttribute('aria-label', this.dictionary().copied);
        window.setTimeout(() => {
            button.classList.remove('is-copied');
            button.dataset.tooltip = label;
            button.setAttribute('aria-label', label);
        }, 1200);
    }

    private renderOptions(currentFilePath: string, labels = this.page?.labels || {}) {
        return {
            currentFilePath,
            labels,
            pages: this.state?.pages || [],
            language: this.state?.language || 'zh'
        } as const;
    }

    private installHandlers(): void {
        this.root.addEventListener('click', event => {
            const target = event.target as HTMLElement | null;
            if (!target) return;
            const projectPicker = target.closest<HTMLElement>('[data-project-picker]');
            if (projectPicker) {
                void this.chooseProject('/api/projects/pick');
                return;
            }
            const recentProject = target.closest<HTMLElement>('[data-recent-project]');
            if (recentProject?.dataset.recentProject) {
                void this.chooseProject('/api/projects/recent', { index: Number(recentProject.dataset.recentProject) });
                return;
            }
            const pageButton = target.closest<HTMLElement>('[data-page-path]');
            if (pageButton?.dataset.pagePath) {
                void this.openPage(pageButton.dataset.pagePath, 'push');
                return;
            }
            const panelButton = target.closest<HTMLElement>('[data-panel]');
            if (panelButton?.dataset.panel) {
                this.openPanel(panelButton.dataset.panel, panelButton);
                return;
            }
            const navigationToggle = target.closest<HTMLElement>('#reader-navigation-toggle');
            if (navigationToggle) {
                this.setNavigationCollapsed(!this.navigationCollapsed);
                return;
            }
            const fontSizeButton = target.closest<HTMLButtonElement>('[data-font-size]');
            if (fontSizeButton?.dataset.fontSize) {
                this.updateFontSize(this.fontSize + Number(fontSizeButton.dataset.fontSize));
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
        window.addEventListener('popstate', () => {
            const filePath = queryPath();
            if (filePath) void this.openPage(filePath, 'pop');
        });
        (this.root.querySelector('#reader-back') as HTMLButtonElement).addEventListener('click', () => this.navigateHistory(-1));
        (this.root.querySelector('#reader-forward') as HTMLButtonElement).addEventListener('click', () => this.navigateHistory(1));
    }

    private installRealtimeUpdates(): void {
        if (this.realtimeEvents) return;
        this.realtimeEvents = new EventSource('/api/events');
        this.realtimeEvents.addEventListener('workspace-update', event => {
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
