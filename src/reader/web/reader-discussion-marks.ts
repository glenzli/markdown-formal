import { readerIcon, type ReaderIconName } from './reader-icons';

export type ReaderDiscussionMarkKind = 'selection' | 'formula' | 'formal' | 'region';
type ReaderDiscussionTool = 'selection' | 'lasso' | 'formal' | 'erase' | undefined;

export interface ReaderDiscussionMarkLocation {
    filePath: string;
    startLine: number;
    endLine: number;
    kind: ReaderDiscussionMarkKind;
    formalId?: string;
    formulaId?: string;
    startTextOffset?: number;
    endTextOffset?: number;
}

export interface ReaderDiscussionMark {
    id: string;
    order: number;
    createdAt: string;
    kind: ReaderDiscussionMarkKind;
    filePath: string;
    title: string;
    startLine: number;
    endLine: number;
    formalId?: string;
    formulaId?: string;
    startTextOffset?: number;
    endTextOffset?: number;
    status: 'current' | 'changed';
}

export interface ReaderDiscussionMarkLabels {
    openTools: string;
    closeTools: string;
    selectTool: string;
    lassoTool: string;
    formalTool: string;
    eraseTool: string;
    selectHint: string;
    lassoHint: string;
    formalHint: string;
    eraseHint: string;
    markAdded: (count: number) => string;
    marksCleared: string;
    remove: string;
    noSourcesCircled: string;
}

export interface ReaderDiscussionMarksHost {
    addMarks(locations: ReaderDiscussionMarkLocation[]): Promise<ReaderDiscussionMark[]>;
    removeMark(id: string): Promise<void>;
    clearMarks(): Promise<void>;
    report(message: string): void;
    toolsChanged(open: boolean, tool: ReaderDiscussionTool): void;
    labels(): ReaderDiscussionMarkLabels;
}

interface BoundDocument {
    filePath: string;
    formalRanges: Record<string, { startLine: number; endLine: number }>;
}

interface LassoPoint {
    x: number;
    y: number;
}

function pointInPolygon(point: LassoPoint, polygon: LassoPoint[]): boolean {
    let inside = false;
    for (let left = 0, right = polygon.length - 1; left < polygon.length; right = left++) {
        const a = polygon[left];
        const b = polygon[right];
        const intersects = ((a.y > point.y) !== (b.y > point.y))
            && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y || 0.000001) + a.x;
        if (intersects) inside = !inside;
    }
    return inside;
}

function lassoPath(points: LassoPoint[]): string {
    const path = points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
    return points.length >= 3 ? `${path} Z` : path;
}

function contiguousLocations(locations: ReaderDiscussionMarkLocation[]): ReaderDiscussionMarkLocation[] {
    const ordered = [...locations]
        .sort((left, right) => left.filePath.localeCompare(right.filePath) || left.startLine - right.startLine || left.endLine - right.endLine);
    const merged: ReaderDiscussionMarkLocation[] = [];
    for (const location of ordered) {
        const previous = merged.at(-1);
        if (previous && previous.filePath === location.filePath && previous.kind === 'region' && location.startLine <= previous.endLine + 2) {
            previous.endLine = Math.max(previous.endLine, location.endLine);
            continue;
        }
        merged.push({ ...location });
    }
    return merged;
}

function sourceElement(node: Node | null): HTMLElement | undefined {
    const element = node?.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : node?.parentElement;
    return element?.closest<HTMLElement>('[data-source-start-line]') || undefined;
}

function formulaElement(node: Node | null): HTMLElement | undefined {
    const element = node?.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : node?.parentElement;
    return element?.closest<HTMLElement>('[data-reader-formula]') || undefined;
}

function rangeIntersectsElement(range: Range, element: HTMLElement): boolean {
    try {
        return range.intersectsNode(element);
    } catch (_error) {
        return false;
    }
}

function rangeInsideElement(range: Range, element: HTMLElement): Range | undefined {
    if (!rangeIntersectsElement(range, element)) return undefined;
    try {
        const clipped = document.createRange();
        clipped.selectNodeContents(element);
        if (element.contains(range.startContainer)) {
            clipped.setStart(range.startContainer, range.startOffset);
        }
        if (element.contains(range.endContainer)) {
            clipped.setEnd(range.endContainer, range.endOffset);
        }
        return clipped.collapsed ? undefined : clipped;
    } catch (_error) {
        return undefined;
    }
}

const CURRENT_TEXT_MARK_HIGHLIGHT = 'math-workspace-discussion-mark';
const CHANGED_TEXT_MARK_HIGHLIGHT = 'math-workspace-discussion-mark-changed';

function isPreciseSelection(mark: Pick<ReaderDiscussionMark, 'kind' | 'startTextOffset' | 'endTextOffset'>): boolean {
    return mark.kind === 'selection'
        && Number.isInteger(mark.startTextOffset)
        && Number.isInteger(mark.endTextOffset)
        && (mark.startTextOffset as number) >= 0
        && (mark.endTextOffset as number) > (mark.startTextOffset as number);
}

function textOffsetWithin(root: HTMLElement, node: Node, offset: number): number | undefined {
    try {
        const prefix = document.createRange();
        prefix.setStart(root, 0);
        prefix.setEnd(node, offset);
        return prefix.toString().length;
    } catch (_error) {
        return undefined;
    }
}

function textPointAt(root: HTMLElement, textOffset: number): { node: Text; offset: number } | undefined {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let remaining = textOffset;
    let node = walker.nextNode() as Text | null;
    let last: Text | undefined;
    while (node) {
        const length = node.data.length;
        if (remaining <= length) return { node, offset: remaining };
        remaining -= length;
        last = node;
        node = walker.nextNode() as Text | null;
    }
    return remaining === 0 && last ? { node: last, offset: last.data.length } : undefined;
}

/**
 * Owns the visible, in-document discussion-mark layer and its explicit tools.
 * It commits only source locations; the Reader API remains the persistence and
 * validation boundary.
 */
export class ReaderDiscussionMarks {
    private article: HTMLElement | undefined;
    private document: BoundDocument | undefined;
    private marks: ReaderDiscussionMark[] = [];
    private toolsOpen = false;
    private activeTool: ReaderDiscussionTool;
    private toolsSurface: HTMLElement | undefined;
    private lassoPoints: LassoPoint[] = [];
    private lassoPathElement: SVGPathElement | undefined;
    private lassoSurface: SVGSVGElement | undefined;
    private pointerId: number | undefined;
    private textHighlightSurface: HTMLElement | undefined;
    private fallbackTextHighlights: Array<{ range: Range; status: ReaderDiscussionMark['status'] }> = [];
    private textHighlightFrame: number | undefined;

    constructor(private readonly host: ReaderDiscussionMarksHost) {}

    bind(article: HTMLElement, document: BoundDocument): void {
        this.cancelLasso();
        this.unbind();
        this.article = article;
        this.document = document;
        article.addEventListener('pointerdown', this.onPointerDown, true);
        article.addEventListener('mouseup', this.onMouseUp, true);
        window.addEventListener('resize', this.onTextHighlightLayout);
        article.querySelectorAll<HTMLElement>('.formal-anchor[id^="formal-"]').forEach(element => {
            const formalId = element.id.slice('formal-'.length);
            element.toggleAttribute('data-discussion-formal', !!document.formalRanges[formalId]);
        });
        this.projectMarks();
        this.projectToolState();
    }

    dispose(): void {
        this.unbind();
        this.setToolsOpen(false);
        this.cancelLasso();
    }

    setMarks(marks: ReaderDiscussionMark[]): void {
        this.marks = [...marks].sort((left, right) => left.order - right.order || left.createdAt.localeCompare(right.createdAt));
        this.projectMarks();
    }

    count(): number {
        return this.marks.length;
    }

    isToolsOpen(): boolean {
        return this.toolsOpen;
    }

    toggleTools(): boolean {
        if (this.toolsOpen) {
            void this.clearAndClose();
            return false;
        }
        this.setToolsOpen(true);
        return true;
    }

    private readonly onPointerDown = (event: PointerEvent): void => {
        if (!this.article || !this.article.contains(event.target as Node)) return;
        const target = event.target as Element;
        const remove = target.closest<HTMLButtonElement>('[data-discussion-mark-remove]');
        if (remove?.dataset.discussionMarkRemove) {
            event.preventDefault();
            event.stopPropagation();
            void this.remove(remove.dataset.discussionMarkRemove);
            return;
        }
        if (this.activeTool === 'erase') {
            const marked = target.closest<HTMLElement>('[data-discussion-mark-ids]');
            const id = marked?.dataset.discussionMarkIds?.split(',').filter(Boolean)[0];
            if (!id) return;
            event.preventDefault();
            event.stopPropagation();
            void this.remove(id);
            return;
        }
        if (this.activeTool === 'formal') {
            const formal = target.closest<HTMLElement>('.formal-anchor[data-discussion-formal]');
            const formalId = formal?.id.slice('formal-'.length);
            if (!formalId || !this.document?.formalRanges[formalId]) return;
            event.preventDefault();
            event.stopPropagation();
            void this.markFormal(formalId);
            return;
        }
        if (this.activeTool !== 'lasso' || event.button !== 0 || target.closest('a, button, input, textarea, select')) return;
        event.preventDefault();
        event.stopPropagation();
        this.pointerId = event.pointerId;
        this.lassoPoints = [{ x: event.clientX, y: event.clientY }];
        this.createLassoSurface();
        window.addEventListener('pointermove', this.onPointerMove, true);
        window.addEventListener('pointerup', this.onPointerUp, true);
        window.addEventListener('pointercancel', this.onPointerCancel, true);
    };

    private readonly onMouseUp = (event: MouseEvent): void => {
        if (this.activeTool !== 'selection' || !this.article?.contains(event.target as Node)) return;
        const locations = this.selectionLocations();
        if (!locations.length) return;
        event.stopPropagation();
        window.getSelection()?.removeAllRanges();
        void this.commit(locations);
    };

    private readonly onPointerMove = (event: PointerEvent): void => {
        if (event.pointerId !== this.pointerId) return;
        const previous = this.lassoPoints.at(-1);
        if (previous && Math.hypot(event.clientX - previous.x, event.clientY - previous.y) < 4) return;
        this.lassoPoints.push({ x: event.clientX, y: event.clientY });
        this.renderLasso();
    };

    private readonly onPointerUp = (event: PointerEvent): void => {
        if (event.pointerId !== this.pointerId) return;
        const previous = this.lassoPoints.at(-1);
        if (!previous || Math.hypot(event.clientX - previous.x, event.clientY - previous.y) >= 2) {
            this.lassoPoints.push({ x: event.clientX, y: event.clientY });
        }
        const locations = this.locationsInsideLasso();
        this.cancelLasso();
        if (locations.length) void this.commit(locations);
        else this.host.report(this.host.labels().noSourcesCircled);
    };

    private readonly onPointerCancel = (event: PointerEvent): void => {
        if (event.pointerId === this.pointerId) this.cancelLasso();
    };

    private selectionLocations(): ReaderDiscussionMarkLocation[] {
        if (!this.article || !this.document) return [];
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || !selection.toString().trim() || selection.rangeCount === 0) return [];
        const range = selection.getRangeAt(0);
        const formulaLocations = Array.from(this.article.querySelectorAll<HTMLElement>('[data-reader-formula]'))
            .filter(element => rangeIntersectsElement(range, element))
            .flatMap(element => {
                const formulaId = element.dataset.readerFormula;
                const formulaSource = sourceElement(element);
                const startLine = Number(formulaSource?.dataset.sourceStartLine);
                const endLine = Number(formulaSource?.dataset.sourceEndLine);
                if (!formulaId || !Number.isInteger(startLine) || !Number.isInteger(endLine) || startLine < 1 || endLine < startLine) {
                    return [];
                }
                return [{
                    filePath: this.document!.filePath,
                    startLine,
                    endLine,
                    kind: 'formula' as const,
                    formulaId
                }];
            });
        const startFormula = formulaElement(range.startContainer);
        const endFormula = formulaElement(range.endContainer);
        if (startFormula && startFormula === endFormula) {
            return formulaLocations.filter(location => location.formulaId === startFormula.dataset.readerFormula).slice(0, 1);
        }
        const sourceLocations = Array.from(this.article.querySelectorAll<HTMLElement>('[data-source-start-line]'))
            .filter(element => !element.parentElement?.closest('[data-source-start-line]'))
            .flatMap(element => {
                if (element.matches('[data-reader-formula]')) return [];
                const clipped = rangeInsideElement(range, element);
                if (!clipped || !clipped.toString().trim()) return [];
                const startTextOffset = textOffsetWithin(element, clipped.startContainer, clipped.startOffset);
                const endTextOffset = textOffsetWithin(element, clipped.endContainer, clipped.endOffset);
                const startLine = Number(element.dataset.sourceStartLine);
                const endLine = Number(element.dataset.sourceEndLine);
                if (!Number.isInteger(startLine)
                    || !Number.isInteger(endLine)
                    || startLine < 1
                    || endLine < startLine
                    || !Number.isInteger(startTextOffset)
                    || !Number.isInteger(endTextOffset)
                    || (endTextOffset as number) <= (startTextOffset as number)) {
                    return [];
                }
                return [{
                    filePath: this.document!.filePath,
                    startLine,
                    endLine,
                    kind: 'selection' as const,
                    startTextOffset,
                    endTextOffset
                }];
            });
        return [...sourceLocations, ...formulaLocations]
            .sort((left, right) => left.startLine - right.startLine || left.endLine - right.endLine || left.kind.localeCompare(right.kind));
    }

    private async markFormal(formalId: string): Promise<void> {
        const range = this.document?.formalRanges[formalId];
        if (!range || !this.document) return;
        await this.commit([{ filePath: this.document.filePath, ...range, kind: 'formal', formalId }]);
    }

    private locationsInsideLasso(): ReaderDiscussionMarkLocation[] {
        if (!this.article || !this.document || this.lassoPoints.length < 3) return [];
        const seen = new Set<string>();
        const locations: ReaderDiscussionMarkLocation[] = [];
        this.article.querySelectorAll<HTMLElement>('[data-source-start-line]').forEach(element => {
            const startLine = Number(element.dataset.sourceStartLine);
            const endLine = Number(element.dataset.sourceEndLine);
            if (!Number.isInteger(startLine) || !Number.isInteger(endLine) || endLine < startLine) return;
            const rect = element.getBoundingClientRect();
            if (!rect.width && !rect.height) return;
            if (!pointInPolygon({ x: rect.left + rect.width / 2, y: rect.top + Math.min(rect.height / 2, 18) }, this.lassoPoints)) return;
            const key = `${startLine}:${endLine}`;
            if (seen.has(key)) return;
            seen.add(key);
            locations.push({ filePath: this.document!.filePath, startLine, endLine, kind: 'region' });
        });
        return contiguousLocations(locations);
    }

    private setToolsOpen(open: boolean): void {
        if (this.toolsOpen === open) return;
        this.toolsOpen = open;
        if (!open) this.activeTool = undefined;
        this.projectToolState();
        if (open) this.renderTools();
        else this.toolsSurface?.remove();
        if (!open) this.toolsSurface = undefined;
        this.host.toolsChanged(open, this.activeTool);
    }

    private setActiveTool(tool: ReaderDiscussionTool): void {
        this.activeTool = this.activeTool === tool ? undefined : tool;
        this.cancelLasso();
        this.projectToolState();
        this.renderTools();
        this.host.toolsChanged(this.toolsOpen, this.activeTool);
    }

    private renderTools(): void {
        if (!this.toolsOpen) return;
        const labels = this.host.labels();
        const surface = this.toolsSurface || document.createElement('aside');
        surface.className = 'reader-discussion-tools';
        surface.setAttribute('role', 'toolbar');
        surface.setAttribute('aria-label', labels.openTools);
        surface.replaceChildren();
        const tool = (name: Exclude<ReaderDiscussionTool, undefined>, icon: ReaderIconName, label: string, hint: string) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'reader-discussion-tool';
            button.classList.toggle('is-active', this.activeTool === name);
            button.dataset.tooltip = `${label} · ${hint}`;
            button.setAttribute('aria-label', `${label} · ${hint}`);
            button.append(readerIcon(icon, 16));
            button.addEventListener('click', () => this.setActiveTool(name));
            surface.append(button);
        };
        tool('selection', 'marker-select', labels.selectTool, labels.selectHint);
        tool('lasso', 'marker-pen', labels.lassoTool, labels.lassoHint);
        tool('formal', 'marker-formal', labels.formalTool, labels.formalHint);
        tool('erase', 'eraser', labels.eraseTool, labels.eraseHint);
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'reader-discussion-tool is-close';
        close.dataset.tooltip = labels.closeTools;
        close.setAttribute('aria-label', labels.closeTools);
        close.append(readerIcon('x', 16));
        close.addEventListener('click', () => void this.clearAndClose());
        surface.append(close);
        if (!this.toolsSurface) document.body.append(surface);
        this.toolsSurface = surface;
    }

    private projectToolState(): void {
        this.article?.classList.toggle('is-discussion-tools-open', this.toolsOpen);
        this.article?.classList.toggle('is-discussion-selection-ready', this.activeTool === 'selection');
        this.article?.classList.toggle('is-discussion-lasso-ready', this.activeTool === 'lasso');
        this.article?.classList.toggle('is-discussion-formal-ready', this.activeTool === 'formal');
        this.article?.classList.toggle('is-discussion-erase-ready', this.activeTool === 'erase');
    }

    private createLassoSurface(): void {
        this.lassoSurface?.remove();
        const surface = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        surface.classList.add('reader-discussion-lasso');
        surface.setAttribute('aria-hidden', 'true');
        surface.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`);
        surface.setAttribute('width', String(window.innerWidth));
        surface.setAttribute('height', String(window.innerHeight));
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        surface.append(path);
        document.body.append(surface);
        this.lassoSurface = surface;
        this.lassoPathElement = path;
        this.renderLasso();
    }

    private renderLasso(): void {
        if (!this.lassoPathElement || !this.lassoPoints.length) return;
        this.lassoPathElement.setAttribute('d', lassoPath(this.lassoPoints));
    }

    private async commit(locations: ReaderDiscussionMarkLocation[]): Promise<void> {
        const marks = await this.host.addMarks(locations);
        this.setMarks(marks);
        this.host.report(this.host.labels().markAdded(locations.length));
    }

    private async remove(id: string): Promise<void> {
        await this.host.removeMark(id);
        this.setMarks(this.marks.filter(mark => mark.id !== id));
    }

    private async clearAndClose(): Promise<void> {
        this.setToolsOpen(false);
        await this.host.clearMarks();
        this.setMarks([]);
        this.host.report(this.host.labels().marksCleared);
    }

    private projectMarks(): void {
        if (!this.article || !this.document) return;
        this.clearTextHighlights();
        const marks = this.marks.filter(mark => mark.filePath === this.document?.filePath);
        const elements = Array.from(this.article.querySelectorAll<HTMLElement>('[data-source-start-line]'));
        const formulaElements = Array.from(this.article.querySelectorAll<HTMLElement>('[data-reader-formula]'));
        this.article.querySelectorAll<HTMLElement>('.reader-discussion-mark-remove').forEach(button => button.remove());
        const origins = new Map<string, HTMLElement>();
        const directFormulaMarkIds = new Set<string>();
        const marksByFormulaElement = new Map<HTMLElement, ReaderDiscussionMark[]>();
        const addFormulaMark = (element: HTMLElement, mark: ReaderDiscussionMark) => {
            const formulaMarks = marksByFormulaElement.get(element) || [];
            formulaMarks.push(mark);
            marksByFormulaElement.set(element, formulaMarks);
        };
        marks.forEach(mark => {
            if (mark.kind === 'formula' && mark.formulaId) {
                const matched = formulaElements.filter(element => element.dataset.readerFormula === mark.formulaId);
                if (matched.length) {
                    matched.forEach(element => addFormulaMark(element, mark));
                    origins.set(mark.id, matched[0]);
                    directFormulaMarkIds.add(mark.id);
                    return;
                }
            }
            const origin = this.originForMark(mark, elements);
            if (origin) origins.set(mark.id, origin);
        });
        const currentTextRanges: Range[] = [];
        const changedTextRanges: Range[] = [];
        const preciseMarkIds = new Set<string>();
        marks.filter(isPreciseSelection).forEach(mark => {
            const origin = origins.get(mark.id);
            const range = origin ? this.rangeForPreciseSelection(mark, origin) : undefined;
            if (!range) return;
            preciseMarkIds.add(mark.id);
            (mark.status === 'changed' ? changedTextRanges : currentTextRanges).push(range);
        });
        const renderedWithNativeHighlight = this.setTextHighlights(currentTextRanges, changedTextRanges);
        if (!renderedWithNativeHighlight) {
            this.setFallbackTextHighlights(currentTextRanges, changedTextRanges);
        }
        const blockMarkIds = new Set(marks
            .filter(mark => !preciseMarkIds.has(mark.id) && !directFormulaMarkIds.has(mark.id))
            .map(mark => mark.id));
        const marksByElement = new Map<HTMLElement, ReaderDiscussionMark[]>();
        const addToElement = (element: HTMLElement, mark: ReaderDiscussionMark) => {
            const elementMarks = marksByElement.get(element) || [];
            elementMarks.push(mark);
            marksByElement.set(element, elementMarks);
        };
        marks.forEach(mark => {
            const origin = origins.get(mark.id);
            if (directFormulaMarkIds.has(mark.id)) return;
            if (preciseMarkIds.has(mark.id) && origin) {
                addToElement(origin, mark);
                return;
            }
            elements
                .filter(element => mark.startLine <= Number(element.dataset.sourceEndLine) && mark.endLine >= Number(element.dataset.sourceStartLine))
                .forEach(element => addToElement(element, mark));
        });
        elements.forEach(element => {
            const elementMarks = marksByElement.get(element) || [];
            const blockMarks = elementMarks.filter(mark => blockMarkIds.has(mark.id));
            element.classList.toggle('is-discussion-marked', blockMarks.length > 0);
            element.classList.toggle('is-discussion-mark-changed', blockMarks.some(mark => mark.status === 'changed'));
            if (elementMarks.length) element.dataset.discussionMarkIds = elementMarks.map(mark => mark.id).join(',');
            else delete element.dataset.discussionMarkIds;
        });
        formulaElements.forEach(element => {
            const formulaMarks = marksByFormulaElement.get(element) || [];
            element.classList.toggle('is-discussion-formula-marked', formulaMarks.length > 0);
            element.classList.toggle('is-discussion-formula-mark-changed', formulaMarks.some(mark => mark.status === 'changed'));
            if (formulaMarks.length) element.dataset.discussionMarkIds = formulaMarks.map(mark => mark.id).join(',');
            else delete element.dataset.discussionMarkIds;
        });
        const marksByOrigin = new Map<HTMLElement, ReaderDiscussionMark[]>();
        marks.forEach(mark => {
            const origin = origins.get(mark.id);
            if (!origin) return;
            const originMarks = marksByOrigin.get(origin) || [];
            originMarks.push(mark);
            marksByOrigin.set(origin, originMarks);
        });
        marksByOrigin.forEach((originMarks, origin) => {
            const mark = originMarks[0];
            origin.classList.add('is-discussion-mark-origin');
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'reader-discussion-mark-remove';
            remove.dataset.discussionMarkRemove = mark.id;
            remove.dataset.tooltip = this.host.labels().remove;
            remove.setAttribute('aria-label', this.host.labels().remove);
            remove.append(readerIcon('x', 14));
            origin.append(remove);
        });
        this.article.querySelectorAll<HTMLElement>('.is-discussion-mark-origin').forEach(element => {
            if (!element.querySelector('.reader-discussion-mark-remove')) element.classList.remove('is-discussion-mark-origin');
        });
    }

    private originForMark(mark: ReaderDiscussionMark, elements: HTMLElement[]): HTMLElement | undefined {
        const exact = elements
            .filter(element => Number(element.dataset.sourceStartLine) === mark.startLine && Number(element.dataset.sourceEndLine) === mark.endLine)
            .sort((left, right) => (left.textContent || '').length - (right.textContent || '').length);
        return exact[0] || elements
            .filter(element => Number(element.dataset.sourceStartLine) <= mark.startLine && Number(element.dataset.sourceEndLine) >= mark.startLine)
            .sort((left, right) => (Number(left.dataset.sourceEndLine) - Number(left.dataset.sourceStartLine)) - (Number(right.dataset.sourceEndLine) - Number(right.dataset.sourceStartLine)))[0];
    }

    private rangeForPreciseSelection(mark: ReaderDiscussionMark, origin: HTMLElement): Range | undefined {
        if (!isPreciseSelection(mark)) return undefined;
        const start = textPointAt(origin, mark.startTextOffset as number);
        const end = textPointAt(origin, mark.endTextOffset as number);
        if (!start || !end) return undefined;
        try {
            const range = document.createRange();
            range.setStart(start.node, start.offset);
            range.setEnd(end.node, end.offset);
            return range.collapsed ? undefined : range;
        } catch (_error) {
            return undefined;
        }
    }

    private setTextHighlights(current: Range[], changed: Range[]): boolean {
        const highlights = (globalThis as any).CSS?.highlights;
        const Highlight = (globalThis as any).Highlight;
        if (!highlights || !Highlight) return false;
        try {
            highlights.set(CURRENT_TEXT_MARK_HIGHLIGHT, new Highlight(...current));
            highlights.set(CHANGED_TEXT_MARK_HIGHLIGHT, new Highlight(...changed));
            return true;
        } catch (_error) {
            this.clearTextHighlights();
            return false;
        }
    }

    private setFallbackTextHighlights(current: Range[], changed: Range[]): void {
        this.fallbackTextHighlights = [
            ...current.map(range => ({ range, status: 'current' as const })),
            ...changed.map(range => ({ range, status: 'changed' as const }))
        ];
        this.renderFallbackTextHighlights();
    }

    private readonly onTextHighlightLayout = (): void => {
        if (!this.fallbackTextHighlights.length || this.textHighlightFrame !== undefined) return;
        this.textHighlightFrame = window.requestAnimationFrame(() => {
            this.textHighlightFrame = undefined;
            this.renderFallbackTextHighlights();
        });
    };

    private renderFallbackTextHighlights(): void {
        if (!this.article || !this.fallbackTextHighlights.length) return;
        const surface = this.textHighlightSurface || document.createElement('span');
        surface.className = 'reader-discussion-text-highlights';
        surface.setAttribute('aria-hidden', 'true');
        surface.replaceChildren();
        const articleRect = this.article.getBoundingClientRect();
        this.fallbackTextHighlights.forEach(({ range, status }) => {
            Array.from(range.getClientRects()).forEach(rect => {
                if (rect.width <= 0 || rect.height <= 0) return;
                const highlight = document.createElement('span');
                highlight.className = 'reader-discussion-text-highlight';
                highlight.classList.toggle('is-discussion-mark-changed', status === 'changed');
                highlight.style.left = `${rect.left - articleRect.left}px`;
                highlight.style.top = `${rect.top - articleRect.top}px`;
                highlight.style.width = `${rect.width}px`;
                highlight.style.height = `${rect.height}px`;
                surface.append(highlight);
            });
        });
        if (!this.textHighlightSurface) this.article.prepend(surface);
        this.textHighlightSurface = surface;
    }

    private clearTextHighlights(): void {
        const highlights = (globalThis as any).CSS?.highlights;
        highlights?.delete(CURRENT_TEXT_MARK_HIGHLIGHT);
        highlights?.delete(CHANGED_TEXT_MARK_HIGHLIGHT);
        if (this.textHighlightFrame !== undefined) window.cancelAnimationFrame(this.textHighlightFrame);
        this.textHighlightFrame = undefined;
        this.fallbackTextHighlights = [];
        this.textHighlightSurface?.remove();
        this.textHighlightSurface = undefined;
    }

    private unbind(): void {
        this.article?.removeEventListener('pointerdown', this.onPointerDown, true);
        this.article?.removeEventListener('mouseup', this.onMouseUp, true);
        window.removeEventListener('resize', this.onTextHighlightLayout);
        this.clearTextHighlights();
        this.article = undefined;
        this.document = undefined;
    }

    private cancelLasso(): void {
        window.removeEventListener('pointermove', this.onPointerMove, true);
        window.removeEventListener('pointerup', this.onPointerUp, true);
        window.removeEventListener('pointercancel', this.onPointerCancel, true);
        this.lassoSurface?.remove();
        this.lassoSurface = undefined;
        this.lassoPathElement = undefined;
        this.lassoPoints = [];
        this.pointerId = undefined;
    }
}
