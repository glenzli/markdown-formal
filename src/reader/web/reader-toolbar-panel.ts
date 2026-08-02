import { readerIcon } from './reader-icons';
import { positionReaderPopover } from './reader-popover';

export interface ReaderToolbarPanelLabels {
    close: string;
}

export class ReaderToolbarPanel {
    private panel: HTMLElement | undefined;
    private trigger: HTMLElement | undefined;
    private activeId = '';
    private readonly onPointerDown = (event: PointerEvent) => {
        const target = event.target as Node | null;
        if (this.panel?.contains(target) || this.trigger?.contains(target)) return;
        this.close();
    };
    private readonly onKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') this.close();
    };
    private readonly onViewportChange = () => this.reposition();

    constructor(private readonly labels: () => ReaderToolbarPanelLabels) {
        document.addEventListener('pointerdown', this.onPointerDown, true);
        document.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('resize', this.onViewportChange);
    }

    open(id: string, trigger: HTMLElement, title: string, populate: (content: HTMLElement) => void): HTMLElement | undefined {
        if (this.activeId === id && this.trigger === trigger) {
            this.close();
            return undefined;
        }
        this.close();

        const panel = document.createElement('section');
        panel.className = 'reader-toolbar-panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', title);
        const header = document.createElement('header');
        const heading = document.createElement('h2');
        heading.textContent = title;
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'reader-panel-close';
        close.append(readerIcon('x'));
        close.dataset.tooltip = this.labels().close;
        close.setAttribute('aria-label', this.labels().close);
        close.addEventListener('click', () => this.close());
        header.append(heading, close);
        const content = document.createElement('div');
        content.className = 'reader-panel-content';
        panel.append(header, content);
        this.panel = panel;
        this.trigger = trigger;
        this.activeId = id;
        trigger.classList.add('is-active');
        trigger.setAttribute('aria-expanded', 'true');
        populate(content);
        this.reposition();
        return content;
    }

    isActive(id: string): boolean {
        return this.activeId === id;
    }

    reposition(): void {
        if (!this.panel || !this.trigger) return;
        positionReaderPopover(this.panel, this.trigger.getBoundingClientRect(), { maxWidth: 580, gap: 8 });
    }

    close(): void {
        this.trigger?.classList.remove('is-active');
        this.trigger?.setAttribute('aria-expanded', 'false');
        this.panel?.remove();
        this.panel = undefined;
        this.trigger = undefined;
        this.activeId = '';
    }

    dispose(): void {
        document.removeEventListener('pointerdown', this.onPointerDown, true);
        document.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('resize', this.onViewportChange);
        this.close();
    }
}
