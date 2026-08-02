import type { ReaderFormula } from './formal-renderer';
import { copyReaderText } from './reader-clipboard';
import { readerIcon, type ReaderIconName } from './reader-icons';
import { closestReaderElement, positionReaderPopover } from './reader-popover';

export interface ReaderDefinitionMatch {
    index: number;
    title: string;
    aliases?: string[];
    filePath: string;
    line: number;
}

export interface ReaderSourceActionLabels {
    copyLatex: string;
    copySelectedMarkdown: string;
    copySourceLines: string;
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

function selectedMarkdownFragment(source: string, selection: string): string | undefined {
    if (!selection || selection.includes('\n')) return source.includes(selection) ? selection : undefined;

    const wrapped = [
        `**${selection}**`,
        `__${selection}__`,
        `*${selection}*`,
        `_${selection}_`,
        `\`${selection}\``
    ].find(candidate => source.includes(candidate));
    if (wrapped) return wrapped;

    const linkStart = source.indexOf(`[${selection}](`);
    if (linkStart >= 0) {
        const linkEnd = source.indexOf(')', linkStart + selection.length + 3);
        if (linkEnd >= 0) return source.slice(linkStart, linkEnd + 1);
    }

    const offset = source.indexOf(selection);
    return offset >= 0 ? source.slice(offset, offset + selection.length) : undefined;
}

function selectedRangeMarkdown(range: Range, formulas: ReaderFormula[]): string {
    const formulaSource = new Map(formulas.map(formula => [formula.id, formula.source]));

    const readNode = (node: Node): string => {
        if (node.nodeType === 3) {
            return node.textContent ?? '';
        }
        if (node.nodeType !== 1 && node.nodeType !== 11) {
            return '';
        }

        const element = node.nodeType === 1 ? node as HTMLElement : undefined;
        const formulaId = element?.dataset.readerFormula;
        if (formulaId) {
            return formulaSource.get(formulaId) ?? element.textContent ?? '';
        }
        if (element?.dataset.formalRef) {
            return `@${element.dataset.formalRef}`;
        }

        const content = Array.from(node.childNodes).map(readNode).join('');
        switch (element?.tagName.toLowerCase()) {
            case 'strong':
            case 'b':
                return `**${content}**`;
            case 'em':
            case 'i':
                return `*${content}*`;
            case 'del':
            case 's':
            case 'strike':
                return `~~${content}~~`;
            case 'code':
                return `\`${content}\``;
            case 'br':
                return '\n';
            default:
                return content;
        }
    };

    return readNode(range.cloneContents()).trim();
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
    private readonly onScroll = (event: Event) => {
        if (this.popover?.contains(event.target as Node | null)) return;
        this.dismiss();
    };
    private readonly onMouseUp = (event: MouseEvent) => {
        if (closestReaderElement(event.target as Node, '[data-reader-formula]')) return;
        window.setTimeout(() => this.showSelectionActions(), 0);
    };
    private readonly onSelectionChange = () => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || !selection.toString().trim()) return;
        const formula = closestReaderElement(selection.anchorNode, '[data-reader-formula]');
        if (formula && this.article?.contains(formula)) {
            window.clearTimeout(this.selectionTimer);
            this.selectionTimer = window.setTimeout(() => this.showSelectionActions(), 100);
            return;
        }
        const start = closestReaderElement(selection.anchorNode, '[data-source-start-line]');
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
        const formulaElement = closestReaderElement(event.target as Node, '[data-reader-formula]');
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

    private selectedSource(): { text: string; markdown?: string; sourceLines: string; rect: DOMRect } | undefined {
        if (!this.article || !this.sourceDocument) return undefined;
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || !selection.toString().trim()) return undefined;
        const start = closestReaderElement(selection.anchorNode, '[data-source-start-line]');
        const end = closestReaderElement(selection.focusNode, '[data-source-start-line]');
        if (!start || !end || !this.article.contains(start) || !this.article.contains(end)) return undefined;
        const startLine = Math.min(Number(start.dataset.sourceStartLine), Number(end.dataset.sourceStartLine));
        const endLine = Math.max(Number(start.dataset.sourceEndLine), Number(end.dataset.sourceEndLine));
        if (!Number.isInteger(startLine) || !Number.isInteger(endLine) || startLine < 1 || endLine < startLine) return undefined;
        const sourceLines = this.sourceDocument.source.split(/\r?\n/).slice(startLine - 1, endLine).join('\n');
        const rect = selectionRect(selection);
        const text = selection.toString().trim();
        if (!sourceLines || !rect) return undefined;
        const sourceSelection = selectedRangeMarkdown(
            selection.getRangeAt(0),
            this.sourceDocument.formulas
        );
        return {
            text,
            markdown: selectedMarkdownFragment(sourceLines, sourceSelection)
                ?? selectedMarkdownFragment(sourceLines, text),
            sourceLines,
            rect
        };
    }

    private showSelectionActions(): void {
        const selection = window.getSelection();
        const formula = closestReaderElement(selection?.anchorNode || null, '[data-reader-formula]');
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
        const definitions = isMeaningfulDefinitionQuery(selected.text)
            ? this.host.getDefinitions(selected.text)
            : [];
        this.openPopover(selected.rect, popover => {
            const actions = document.createElement('div');
            actions.className = 'reader-source-actions';
            if (selected.markdown) {
                actions.append(this.iconButton('copy-source', labels.copySelectedMarkdown, async button => {
                    await this.copyAndMark(button, selected.markdown as string);
                }));
            }
            actions.append(this.iconButton('copy-line', labels.copySourceLines, async button => {
                await this.copyAndMark(button, selected.sourceLines);
            }));
            if (definitions.length > 0) {
                actions.append(this.iconButton('definition', labels.lookupDefinition, () => {
                    this.showDefinitionLookup(selected.text, selected.rect, definitions);
                }));
            }
            popover.append(actions);
        }, true);
    }

    private showFormulaActions(formula: ReaderFormula, rect: DOMRect): void {
        const labels = this.host.labels();
        this.openPopover(rect, popover => {
            const actions = document.createElement('div');
            actions.className = 'reader-source-actions';
            actions.append(
                this.iconButton('copy', labels.copyLatex, async button => {
                    await this.copyAndMark(button, formula.latex);
                })
            );
            popover.append(actions);
        }, true);
    }

    private showDefinitionLookup(query: string, rect: DOMRect, matches?: ReaderDefinitionMatch[]): void {
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
        const results = matches || this.host.getDefinitions(query);
        if (results.length === 0) {
            this.openPopover(rect, popover => {
                const message = document.createElement('p');
                message.className = 'reader-source-message';
                message.textContent = labels.noDefinitions;
                popover.append(message);
            });
            return;
        }
        if (results.length === 1) {
            void this.showDefinitionDetail(results[0], rect);
            return;
        }
        this.openPopover(rect, popover => {
            const list = document.createElement('div');
            list.className = 'reader-definition-choices';
            results.slice(0, 7).forEach(match => {
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
            const header = document.createElement('header');
            header.className = 'reader-definition-header';
            const title = document.createElement('strong');
            title.className = 'reader-definition-title';
            title.textContent = definition.title || match.title;
            const content = document.createElement('div');
            content.className = 'reader-inline-definition';
            content.innerHTML = this.host.renderDefinition(definition);
            const locate = this.iconButton('locate', this.host.labels().locate, () => {
                this.host.locateDefinition(match);
                this.dismiss();
            });
            header.append(title, locate);
            popover.append(header, content);
        });
    }

    private openPopover(rect: DOMRect, populate: (popover: HTMLElement) => void, compact = false): void {
        this.dismiss();
        const popover = document.createElement('section');
        popover.className = 'reader-source-popover';
        if (compact) popover.classList.add('is-actions-only');
        populate(popover);
        this.popover = popover;
        positionReaderPopover(popover, rect, { maxWidth: 460 });
    }

    private iconButton(icon: ReaderIconName, label: string, action: (button: HTMLButtonElement) => void | Promise<void>): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'reader-source-action';
        button.append(readerIcon(icon));
        button.dataset.tooltip = label;
        button.setAttribute('aria-label', label);
        button.addEventListener('click', () => void action(button));
        return button;
    }

    private async copyAndMark(button: HTMLButtonElement, value: string): Promise<void> {
        const copied = await copyReaderText(value);
        if (!copied) return;
        const label = button.dataset.tooltip || button.getAttribute('aria-label') || '';
        button.classList.add('is-copied');
        button.dataset.tooltip = this.host.labels().copied;
        button.setAttribute('aria-label', this.host.labels().copied);
        window.setTimeout(() => {
            button.classList.remove('is-copied');
            button.dataset.tooltip = label;
            button.setAttribute('aria-label', label);
        }, 1200);
    }
}
