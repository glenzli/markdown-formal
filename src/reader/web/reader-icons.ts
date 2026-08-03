import {
    ArrowLeft,
    BookOpenText,
    ChevronLeft,
    ChevronRight,
    createElement,
    Copy,
    GitBranch,
    ListTree,
    LocateFixed,
    MessageSquarePlus,
    PanelLeftClose,
    PanelLeftOpen,
    Plus,
    RefreshCw,
    Sigma,
    Star,
    X,
    type IconNode
} from 'lucide';

export type ReaderIconName =
    | 'arrow-left'
    | 'locate'
    | 'copy'
    | 'definition'
    | 'chevron-left'
    | 'chevron-right'
    | 'copy-source'
    | 'copy-line'
    | 'handoff'
    | 'propositions'
    | 'contents'
    | 'navigation-close'
    | 'navigation-open'
    | 'plus'
    | 'reload'
    | 'sigma'
    | 'star'
    | 'x';

const ICONS: Record<ReaderIconName, IconNode> = {
    'arrow-left': ArrowLeft,
    locate: LocateFixed,
    copy: Copy,
    definition: BookOpenText,
    'chevron-left': ChevronLeft,
    'chevron-right': ChevronRight,
    'copy-source': Copy,
    'copy-line': Copy,
    handoff: MessageSquarePlus,
    propositions: GitBranch,
    contents: ListTree,
    'navigation-close': PanelLeftClose,
    'navigation-open': PanelLeftOpen,
    plus: Plus,
    reload: RefreshCw,
    sigma: Sigma,
    star: Star,
    x: X
};

export function readerIcon(name: ReaderIconName, size = 16): SVGSVGElement {
    const icon = createElement(ICONS[name]) as SVGSVGElement;
    icon.setAttribute('aria-hidden', 'true');
    icon.setAttribute('focusable', 'false');
    icon.setAttribute('height', String(size));
    icon.setAttribute('width', String(size));
    icon.setAttribute('stroke-width', '1.8');
    icon.classList.add('reader-icon');
    if (name === 'copy-source') icon.classList.add('is-source-copy');
    if (name === 'copy-line') icon.classList.add('is-line-copy');
    return icon;
}

export function replaceReaderButtonIcon(button: HTMLElement, name: ReaderIconName, size = 16): void {
    button.replaceChildren(readerIcon(name, size));
}
