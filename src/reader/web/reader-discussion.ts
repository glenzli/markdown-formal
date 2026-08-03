import { readerIcon } from './reader-icons';
import type { ReaderDiscussionSelection } from './source-actions';

export interface ReaderDiscussionLabels {
    temporaryDiscussion: string;
    temporaryDiscussionContext: string;
    temporaryDiscussionAccess: string;
    temporaryDiscussionTools: string;
    temporaryDiscussionPrompt: string;
    temporaryDiscussionSend: string;
    temporaryDiscussionEmpty: string;
    temporaryDiscussionReadOnly: string;
    temporaryDiscussionBoundTask: string;
    temporaryDiscussionNoTask: string;
    temporaryDiscussionInject: string;
    temporaryDiscussionInjecting: string;
    temporaryDiscussionInjected: string;
    temporaryDiscussionRefresh: string;
    close: string;
}

export interface ReaderDiscussionHost {
    postJson<T>(url: string, value?: unknown): Promise<T>;
    renderMarkdown(markdown: string, filePath: string): string;
    labels(): ReaderDiscussionLabels;
    hasBoundTask(): boolean;
    openTaskPanel(): void;
}

interface DiscussionMessage {
    role: 'user' | 'assistant' | 'notice';
    text: string;
}

interface DiscussionTurnResponse {
    discussionId: string;
    message: string;
}

interface TaskInjectionResponse {
    taskId: string;
    message: string;
}

interface DiscussionRefreshResponse {
    discussionId: string;
    messages: Array<{ role: 'user' | 'assistant'; text: string }>;
}

/**
 * Reader-owned UI for a Codex ephemeral thread. It deliberately keeps the
 * session handle in memory and only exposes an explicit conclusion handoff.
 */
export class ReaderDiscussionDialog {
    private dialog: HTMLElement | undefined;
    private selection: ReaderDiscussionSelection | undefined;
    private discussionId = '';
    private messages: DiscussionMessage[] = [];
    private pending = false;
    private readonly onKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') this.close();
    };

    constructor(private readonly host: ReaderDiscussionHost) {
        document.addEventListener('keydown', this.onKeyDown);
    }

    open(selection: ReaderDiscussionSelection, initialPrompt?: string): void {
        this.close();
        this.selection = selection;
        this.discussionId = '';
        this.messages = [];
        this.pending = false;
        this.render();
        if (initialPrompt) void this.send(initialPrompt);
    }

    dispose(): void {
        document.removeEventListener('keydown', this.onKeyDown);
        this.close();
    }

    private close(notify = true): void {
        const discussionId = this.discussionId;
        this.dialog?.remove();
        this.dialog = undefined;
        this.selection = undefined;
        this.discussionId = '';
        this.messages = [];
        this.pending = false;
        if (notify && discussionId) void this.host.postJson('/api/codex/discussions/' + discussionId + '/close');
    }

    private render(): void {
        const selection = this.selection;
        if (!selection) return;
        const labels = this.host.labels();
        const dialog = document.createElement('aside');
        dialog.className = 'reader-discussion-dialog';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-label', labels.temporaryDiscussion);

        const header = document.createElement('header');
        const title = document.createElement('h2');
        title.textContent = labels.temporaryDiscussion;
        const controls = document.createElement('div');
        controls.className = 'reader-discussion-header-actions';
        const task = this.iconButton('task', labels.temporaryDiscussionBoundTask, () => this.host.openTaskPanel());
        task.classList.toggle('is-muted', !this.host.hasBoundTask());
        const refresh = this.iconButton('reload', labels.temporaryDiscussionRefresh, () => void this.refresh());
        refresh.disabled = !this.discussionId || this.pending;
        const close = this.iconButton('x', labels.close, () => this.close());
        controls.append(task, refresh, close);
        header.append(title, controls);

        const context = document.createElement('details');
        context.className = 'reader-discussion-context';
        context.open = true;
        const summary = document.createElement('summary');
        summary.textContent = labels.temporaryDiscussionContext + ' · ' + selection.filePath + ':' + selection.startLine + '–' + selection.endLine;
        const source = document.createElement('pre');
        source.textContent = selection.markdown || selection.sourceLines;
        const access = document.createElement('div');
        access.className = 'reader-discussion-access';
        const accessTitle = document.createElement('strong');
        accessTitle.textContent = labels.temporaryDiscussionAccess;
        const accessDescription = document.createElement('p');
        accessDescription.textContent = labels.temporaryDiscussionTools;
        access.append(accessTitle, accessDescription);
        context.append(summary, source, access);

        const thread = document.createElement('section');
        thread.className = 'reader-discussion-thread';
        if (!this.messages.length) {
            const empty = document.createElement('p');
            empty.className = 'reader-discussion-empty';
            empty.textContent = labels.temporaryDiscussionReadOnly;
            thread.append(empty);
        } else {
            this.messages.forEach(message => thread.append(this.renderMessage(message)));
        }

        const composer = document.createElement('form');
        composer.className = 'reader-discussion-composer';
        const prompt = document.createElement('textarea');
        prompt.rows = 3;
        prompt.placeholder = labels.temporaryDiscussionPrompt;
        prompt.disabled = this.pending;
        const send = document.createElement('button');
        send.type = 'submit';
        send.className = 'reader-discussion-send';
        send.textContent = labels.temporaryDiscussionSend;
        send.disabled = this.pending;
        composer.append(prompt, send);
        composer.addEventListener('submit', event => {
            event.preventDefault();
            const value = prompt.value.trim();
            if (!value || this.pending) return;
            void this.send(value);
        });
        prompt.addEventListener('keydown', event => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') composer.requestSubmit();
        });

        dialog.append(header, context, thread, composer);
        if (this.dialog) this.dialog.replaceWith(dialog);
        else document.body.append(dialog);
        this.dialog = dialog;
        window.requestAnimationFrame(() => {
            const latest = dialog.querySelector<HTMLElement>('.reader-discussion-message:last-child');
            latest?.scrollIntoView({ block: 'nearest' });
            if (!this.pending) prompt.focus();
        });
    }

    private renderMessage(message: DiscussionMessage): HTMLElement {
        const selection = this.selection as ReaderDiscussionSelection;
        const item = document.createElement('article');
        item.className = 'reader-discussion-message is-' + message.role;
        if (message.role === 'assistant') {
            const content = document.createElement('div');
            content.className = 'reader-discussion-response';
            content.innerHTML = message.text
                ? this.host.renderMarkdown(message.text, selection.filePath)
                : '<p>' + this.host.labels().temporaryDiscussionEmpty + '</p>';
            const actions = document.createElement('div');
            actions.className = 'reader-discussion-message-actions';
            const inject = this.iconButton('task', this.host.labels().temporaryDiscussionInject, () => void this.injectConclusion(message.text));
            inject.disabled = !this.host.hasBoundTask() || this.pending;
            if (!this.host.hasBoundTask()) inject.dataset.tooltip = this.host.labels().temporaryDiscussionNoTask;
            actions.append(inject);
            item.append(content, actions);
            return item;
        }
        item.textContent = message.text;
        return item;
    }

    private async send(prompt: string): Promise<void> {
        const selection = this.selection;
        if (!selection || this.pending) return;
        this.messages.push({ role: 'user', text: prompt });
        this.pending = true;
        this.render();
        try {
            const result = this.discussionId
                ? await this.host.postJson<DiscussionTurnResponse>('/api/codex/discussions/' + this.discussionId + '/turn', { prompt })
                : await this.host.postJson<DiscussionTurnResponse>('/api/codex/discussions', { prompt, selection });
            this.discussionId = result.discussionId;
            this.messages.push({ role: 'assistant', text: result.message });
        } catch (error) {
            this.messages.push({ role: 'notice', text: error instanceof Error ? error.message : String(error) });
        } finally {
            this.pending = false;
            this.render();
        }
    }

    private async injectConclusion(conclusion: string): Promise<void> {
        if (!this.discussionId || !conclusion || this.pending || !this.host.hasBoundTask()) return;
        this.pending = true;
        this.messages.push({ role: 'notice', text: this.host.labels().temporaryDiscussionInjecting });
        this.render();
        try {
            const result = await this.host.postJson<TaskInjectionResponse>('/api/codex/discussions/' + this.discussionId + '/inject', { conclusion });
            this.messages.push({ role: 'notice', text: result.message || this.host.labels().temporaryDiscussionInjected });
        } catch (error) {
            this.messages.push({ role: 'notice', text: error instanceof Error ? error.message : String(error) });
        } finally {
            this.pending = false;
            this.render();
        }
    }

    private async refresh(): Promise<void> {
        if (!this.discussionId || this.pending) return;
        this.pending = true;
        this.render();
        try {
            const result = await this.host.postJson<DiscussionRefreshResponse>('/api/codex/discussions/' + this.discussionId + '/refresh');
            if (result.discussionId === this.discussionId && Array.isArray(result.messages)) {
                this.messages = result.messages
                    .filter(message => (message.role === 'user' || message.role === 'assistant') && typeof message.text === 'string')
                    .map(message => ({ role: message.role, text: message.text }));
            }
        } catch (error) {
            this.messages.push({ role: 'notice', text: error instanceof Error ? error.message : String(error) });
        } finally {
            this.pending = false;
            this.render();
        }
    }

    private iconButton(icon: 'task' | 'reload' | 'x', label: string, action: () => void): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'reader-discussion-icon-button';
        button.dataset.tooltip = label;
        button.setAttribute('aria-label', label);
        button.append(readerIcon(icon));
        button.addEventListener('click', action);
        return button;
    }
}
