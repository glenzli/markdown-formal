/**
 * A viewport-level tooltip for small reader affordances that may live inside
 * independently scrolling regions such as the page navigation.
 */
export class ReaderTooltip {
    private readonly element = document.createElement('div');
    private active: HTMLElement | undefined;
    private root: HTMLElement | undefined;
    private readonly onPointerOver = (event: PointerEvent) => {
        const trigger = this.findTrigger(event.target);
        if (trigger) this.show(trigger);
    };
    private readonly onPointerOut = (event: PointerEvent) => {
        const trigger = this.findTrigger(event.target);
        if (!trigger) return;
        const related = event.relatedTarget;
        if (!(related instanceof Node) || !trigger.contains(related)) this.hide(trigger);
    };
    private readonly onFocusIn = (event: FocusEvent) => {
        const trigger = this.findTrigger(event.target);
        if (trigger) this.show(trigger);
    };
    private readonly onFocusOut = (event: FocusEvent) => {
        const trigger = this.findTrigger(event.target);
        if (trigger) this.hide(trigger);
    };
    private readonly onViewportChange = () => this.reposition();

    constructor() {
        this.element.className = 'reader-global-tooltip';
        this.element.setAttribute('role', 'tooltip');
        this.element.hidden = true;
        document.body.append(this.element);
        window.addEventListener('resize', this.onViewportChange);
        window.addEventListener('scroll', this.onViewportChange, true);
    }

    bind(root: HTMLElement): void {
        this.root = root;
        root.addEventListener('pointerover', this.onPointerOver);
        root.addEventListener('pointerout', this.onPointerOut);
        root.addEventListener('focusin', this.onFocusIn);
        root.addEventListener('focusout', this.onFocusOut);
    }

    dispose(): void {
        this.root?.removeEventListener('pointerover', this.onPointerOver);
        this.root?.removeEventListener('pointerout', this.onPointerOut);
        this.root?.removeEventListener('focusin', this.onFocusIn);
        this.root?.removeEventListener('focusout', this.onFocusOut);
        window.removeEventListener('resize', this.onViewportChange);
        window.removeEventListener('scroll', this.onViewportChange, true);
        this.element.remove();
    }

    private findTrigger(target: EventTarget | null): HTMLElement | undefined {
        if (!(target instanceof Element)) return undefined;
        const trigger = target.closest<HTMLElement>('[data-reader-tooltip]');
        return trigger && this.root?.contains(trigger) ? trigger : undefined;
    }

    private show(trigger: HTMLElement): void {
        const text = trigger.dataset.readerTooltip;
        if (!text) return;
        this.active = trigger;
        this.element.textContent = text;
        this.element.hidden = false;
        this.element.classList.add('is-visible');
        this.reposition();
    }

    private hide(trigger: HTMLElement): void {
        if (this.active !== trigger) return;
        this.active = undefined;
        this.element.classList.remove('is-visible');
        this.element.hidden = true;
    }

    private reposition(): void {
        if (!this.active || this.element.hidden) return;
        const trigger = this.active.getBoundingClientRect();
        const tooltip = this.element.getBoundingClientRect();
        const padding = 12;
        const gap = 9;
        const right = trigger.right + gap;
        const left = right + tooltip.width <= window.innerWidth - padding
            ? right
            : Math.max(padding, trigger.left - tooltip.width - gap);
        const top = Math.max(
            padding,
            Math.min(window.innerHeight - tooltip.height - padding, trigger.top + trigger.height / 2 - tooltip.height / 2)
        );
        this.element.style.left = Math.round(left) + 'px';
        this.element.style.top = Math.round(top) + 'px';
    }
}
