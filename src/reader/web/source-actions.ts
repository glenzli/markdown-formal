import type { ReaderFormula } from './formal-renderer';

export interface ReaderDefinitionMatch {
    index: number;
    title: string;
    aliases?: string[];
    filePath: string;
    line: number;
}

export interface ReaderSourceActionLabels {
    copyLatex: string;
    copyMarkdown: string;
    copySource: string;
    lookupDefinition: string;
    locate: string;
    copied: string;
    noDefinitions: string;
    refineDefinitionQuery: string;
}

export interface ReaderSourceActionsHost {
    getDefinitions(query: string): ReaderDefinitionMatch[];
    fetchDefinition(index: number): Promise<any>;
    renderDefinition(definition: any): string;
    locateDefinition(definition: ReaderDefinitionMatch): void;
    labels(): ReaderSourceActionLabels;
}

interface SourceDocument {
    source: string;
    formulas: ReaderFormula[];
}

function isMeaningfulDefinitionQuery(value: string): boolean {
    const compact = value.replace(/\s+/g, '');
    const cjkCount = Array.from(compact).filter(character => /[\u3400-\u9fff]/.test(character)).length;
    if (cjkCount >= 2) return true;
    return /[A-Za-z0-9]/.test(compact) && compact.length >= 3;
}

function selectionRect(selection: Selection): DOMRect | undefined {
    if (selection.rangeCount === 0) return undefined;
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    return rect.width || rect.height ? rect : undefined;
}

function closestElement(node: Node | null, selector: string): HTMLElement | undefined {
    const element = node?.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : node?.parentElement;
    const match = element?.closest<HTMLElement>(selector);
    return match || undefined;
}

function positionPopover(popover: HTMLElement, targetRect: DOMRect): void {
    const gutter = 12;
    const maxWidth = Math.min(420, window.innerWidth - gutter * 2);
    popover.style.maxWidth = maxWidth + 'px';
    popover.style.visibility = 'hidden';
    popover.style.left = gutter + 'px';
    popover.style.top = gutter + 'px';
    document.body.append(popover);
    const rect = popover.getBoundingClientRect();
    const preferredTop = targetRect.bottom + 10;
    const top = preferredTop + rect.height <= window.innerHeight - gutter
        ? preferredTop
        : Math.max(gutter, targetRect.top - rect.height - 10);
    const left = Math.max(gutter, Math.min(targetRect.left, window.innerWidth - rect.width - gutter));
    popover.style.left = left + 'px';
    popover.style.top = top + 'px';
    popover.style.visibility = '';
}

async function copyText(value: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(value);
        return true;
    } catch (_error) {
        const fallback = document.createElement('textarea');
        fallback.value = value;
        fallback.style.position = 'fixed';
        fallback.style.opacity = '0';
        document.body.append(fallback);
        fallback.select();
        const copied = document.execCommand('copy');
        fallback.remove();
        return copied;
    }
}

export class ReaderSourceActions {
    private article: HTMLElement | undefined;
    private sourceDocument: SourceDocument | undefined;
    private popover: HTMLElement | undefined;
    private selectionTimer: number | undefined;
    private definitionRequestId = 0;
    private readonly onPointerDown = (event: PointerEvent) => {
        const target = event.target as Node | null;
        if (this.article?.contains(target) || this.popover?.contains(target)) return;
        this.dismiss();
    };
    private readonly onKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') this.dismiss();
    };
    private readonly onResize = () => this.dismiss();
    private readonly onScroll = () => this.dismiss();
    private readonly onMouseUp = (event: MouseEvent) => {
        if (closestElement(event.target as Node, '[data-reader-formula]')) return;
        window.setTimeout(() => this.showSelectionActions(), 0);
    };
    private readonly onSelectionChange = () => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || !selection.toString().trim()) return;
        const formula = closestElement(selection.anchorNode, '[data-reader-formula]');
        if (formula && this.article?.contains(formula)) {
            window.clearTimeout(this.selectionTimer);
            this.selectionTimer = window.setTimeout(() => this.showSelectionActions(), 100);
            return;
        }
        const start = closestElement(selection.anchorNode, '[data-source-start-line]');
        if (!start || !this.article?.contains(start)) return;
        window.clearTimeout(this.selectionTimer);
        this.selectionTimer = window.setTimeout(() => this.showSelectionActions(), 100);
    };
    private readonly onKeyUp = (event: KeyboardEvent) => {
        if (event.shiftKey || event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            this.showSelectionActions();
        }
    };
    private readonly onArticleClick = (event: MouseEvent) => {
        const formulaElement = closestElement(event.target as Node, '[data-reader-formula]');
        if (!formulaElement?.dataset.readerFormula) return;
        const formula = this.sourceDocument?.formulas.find(item => item.id === formulaElement.dataset.readerFormula);
        if (formula) this.showFormulaActions(formula, formulaElement.getBoundingClientRect());
    };

    constructor(private readonly host: ReaderSourceActionsHost) {
        document.addEventListener('pointerdown', this.onPointerDown, true);
        document.addEventListener('keydown', this.onKeyDown);
        document.addEventListener('selectionchange', this.onSelectionChange);
        document.addEventListener('scroll', this.onScroll, true);
        window.addEventListener('resize', this.onResize);
    }

    bind(article: HTMLElement, sourceDocument: SourceDocument): void {
        if (this.article && this.article !== article) this.unbindArticle(this.article);
        this.article = article;
        this.sourceDocument = sourceDocument;
        article.removeEventListener('mouseup', this.onMouseUp);
        article.removeEventListener('keyup', this.onKeyUp);
        article.removeEventListener('click', this.onArticleClick);
        article.addEventListener('mouseup', this.onMouseUp);
        article.addEventListener('keyup', this.onKeyUp);
        article.addEventListener('click', this.onArticleClick);
        this.dismiss();
    }

    dispose(): void {
        if (this.article) this.unbindArticle(this.article);
        document.removeEventListener('pointerdown', this.onPointerDown, true);
        document.removeEventListener('keydown', this.onKeyDown);
        document.removeEventListener('selectionchange', this.onSelectionChange);
        document.removeEventListener('scroll', this.onScroll, true);
        window.removeEventListener('resize', this.onResize);
        window.clearTimeout(this.selectionTimer);
        this.dismiss();
    }

    private unbindArticle(article: HTMLElement): void {
        article.removeEventListener('mouseup', this.onMouseUp);
        article.removeEventListener('keyup', this.onKeyUp);
        article.removeEventListener('click', this.onArticleClick);
    }

    private dismiss(): void {
        this.definitionRequestId++;
        this.popover?.remove();
        this.popover = undefined;
    }

    private selectedSource(): { text: string; source: string; rect: DOMRect } | undefined {
        if (!this.article || !this.sourceDocument) return undefined;
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || !selection.toString().trim()) return undefined;
        const start = closestElement(selection.anchorNode, '[data-source-start-line]');
        const end = closestElement(selection.focusNode, '[data-source-start-line]');
        if (!start || !end || !this.article.contains(start) || !this.article.contains(end)) return undefined;
        const startLine = Math.min(Number(start.dataset.sourceStartLine), Number(end.dataset.sourceStartLine));
        const endLine = Math.max(Number(start.dataset.sourceEndLine), Number(end.dataset.sourceEndLine));
        if (!Number.isInteger(startLine) || !Number.isInteger(endLine) || startLine < 1 || endLine < startLine) return undefined;
        const source = this.sourceDocument.source.split(/\r?\n/).slice(startLine - 1, endLine).join('\n');
        const rect = selectionRect(selection);
        if (!source || !rect) return undefined;
        return { text: selection.toString().trim(), source, rect };
    }

    private showSelectionActions(): void {
        const selection = window.getSelection();
        const formula = closestElement(selection?.anchorNode || null, '[data-reader-formula]');
        if (formula?.dataset.readerFormula) {
            const item = this.sourceDocument?.formulas.find(candidate => candidate.id === formula.dataset.readerFormula);
            const rect = selection ? selectionRect(selection) : undefined;
            if (item) {
                this.showFormulaActions(item, rect || formula.getBoundingClientRect());
                return;
            }
        }
        const selected = this.selectedSource();
        if (!selected) {
            this.dismiss();
            return;
        }
        const labels = this.host.labels();
        this.openPopover(selected.rect, popover => {
            const actions = document.createElement('div');
            actions.className = 'reader-source-actions';
            actions.append(
                this.actionButton(labels.copyMarkdown, async button => {
                    await this.copyAndMark(button, selected.source);
                }),
                this.actionButton(labels.lookupDefinition, () => this.showDefinitionLookup(selected.text, selected.rect))
            );
            popover.append(actions);
        });
    }

    private showFormulaActions(formula: ReaderFormula, rect: DOMRect): void {
        const labels = this.host.labels();
        this.openPopover(rect, popover => {
            const preview = document.createElement('code');
            preview.className = 'reader-formula-source';
            preview.textContent = formula.latex;
            const actions = document.createElement('div');
            actions.className = 'reader-source-actions';
            actions.append(
                this.actionButton(labels.copyLatex, async button => {
                    await this.copyAndMark(button, formula.latex);
                }),
                this.actionButton(labels.copySource, async button => {
                    await this.copyAndMark(button, formula.source);
                })
            );
            popover.append(preview, actions);
        });
    }

    private showDefinitionLookup(query: string, rect: DOMRect): void {
        const labels = this.host.labels();
        if (!isMeaningfulDefinitionQuery(query)) {
            this.openPopover(rect, popover => {
                const message = document.createElement('p');
                message.className = 'reader-source-message';
                message.textContent = labels.refineDefinitionQuery;
                popover.append(message);
            });
            return;
        }
        const matches = this.host.getDefinitions(query);
        if (matches.length === 0) {
            this.openPopover(rect, popover => {
                const message = document.createElement('p');
                message.className = 'reader-source-message';
                message.textContent = labels.noDefinitions;
                popover.append(message);
            });
            return;
        }
        if (matches.length === 1) {
            void this.showDefinitionDetail(matches[0], rect);
            return;
        }
        this.openPopover(rect, popover => {
            const list = document.createElement('div');
            list.className = 'reader-definition-choices';
            matches.slice(0, 7).forEach(match => {
                const button = document.createElement('button');
                button.type = 'button';
                button.textContent = match.title;
                button.addEventListener('click', () => void this.showDefinitionDetail(match, rect));
                list.append(button);
            });
            popover.append(list);
        });
    }

    private async showDefinitionDetail(match: ReaderDefinitionMatch, rect: DOMRect): Promise<void> {
        const requestId = ++this.definitionRequestId;
        let definition: any;
        try {
            definition = await this.host.fetchDefinition(match.index);
        } catch (_error) {
            if (requestId !== this.definitionRequestId) return;
            this.openPopover(rect, popover => {
                const message = document.createElement('p');
                message.className = 'reader-source-message';
                message.textContent = this.host.labels().noDefinitions;
                popover.append(message);
            });
            return;
        }
        if (requestId !== this.definitionRequestId) return;
        this.openPopover(rect, popover => {
            const title = document.createElement('strong');
            title.className = 'reader-definition-title';
            title.textContent = definition.title || match.title;
            const content = document.createElement('div');
            content.className = 'reader-inline-definition';
            content.innerHTML = this.host.renderDefinition(definition);
            const locate = this.actionButton(this.host.labels().locate, () => {
                this.host.locateDefinition(match);
                this.dismiss();
            });
            popover.append(title, content, locate);
        });
    }

    private openPopover(rect: DOMRect, populate: (popover: HTMLElement) => void): void {
        this.dismiss();
        const popover = document.createElement('section');
        popover.className = 'reader-source-popover';
        populate(popover);
        this.popover = popover;
        positionPopover(popover, rect);
    }

    private actionButton(label: string, action: (button: HTMLButtonElement) => void | Promise<void>): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'reader-source-action';
        button.textContent = label;
        button.addEventListener('click', () => void action(button));
        return button;
    }

    private async copyAndMark(button: HTMLButtonElement, value: string): Promise<void> {
        const copied = await copyText(value);
        if (!copied) return;
        const label = button.textContent;
        button.textContent = this.host.labels().copied;
        window.setTimeout(() => { button.textContent = label; }, 1200);
    }
}
