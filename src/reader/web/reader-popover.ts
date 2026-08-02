export interface ReaderPopoverPositionOptions {
    gutter?: number;
    gap?: number;
    maxWidth?: number;
}

export function closestReaderElement<T extends HTMLElement = HTMLElement>(node: Node | null, selector: string): T | undefined {
    const element = node?.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : node?.parentElement;
    return element?.closest<T>(selector) || undefined;
}

export function positionReaderPopover(
    popover: HTMLElement,
    targetRect: DOMRect,
    options: ReaderPopoverPositionOptions = {}
): void {
    const gutter = options.gutter ?? 12;
    const gap = options.gap ?? 10;
    const maxWidth = Math.min(options.maxWidth ?? 520, window.innerWidth - gutter * 2);
    popover.style.maxWidth = maxWidth + 'px';
    popover.style.visibility = 'hidden';
    popover.style.left = gutter + 'px';
    popover.style.top = gutter + 'px';
    if (!popover.isConnected) document.body.append(popover);

    const rect = popover.getBoundingClientRect();
    const preferredTop = targetRect.bottom + gap;
    const top = preferredTop + rect.height <= window.innerHeight - gutter
        ? preferredTop
        : Math.max(gutter, targetRect.top - rect.height - gap);
    const left = Math.max(gutter, Math.min(targetRect.left, window.innerWidth - rect.width - gutter));
    popover.style.left = left + 'px';
    popover.style.top = top + 'px';
    popover.style.visibility = '';
}
