import * as crypto from 'node:crypto';
import * as path from 'node:path';

const MAX_IDLE_MS = 2 * 60 * 60 * 1000;
const MAX_MESSAGES = 120;

export interface ReaderTemporaryDiscussionMessage {
    role: 'user' | 'assistant';
    text: string;
}

export interface ReaderTemporaryDiscussion {
    id: string;
    rootPath: string;
    threadId: string;
    context: Record<string, unknown>;
    messages: ReaderTemporaryDiscussionMessage[];
    createdAt: string;
    lastActiveAt: string;
}

/**
 * Owns only the Math Workspace process's opaque handles for ephemeral Codex threads.
 * Codex owns the threads themselves; closing Math Workspace clears these handles.
 */
export class ReaderTemporaryDiscussionRegistry {
    private readonly discussions = new Map<string, ReaderTemporaryDiscussion>();

    create(
        rootPath: string,
        threadId: string,
        context: Record<string, unknown>,
        messages: ReaderTemporaryDiscussionMessage[] = []
    ): ReaderTemporaryDiscussion {
        this.prune();
        const now = new Date().toISOString();
        const discussion: ReaderTemporaryDiscussion = {
            id: crypto.randomBytes(18).toString('hex'),
            rootPath: path.resolve(rootPath),
            threadId,
            context,
            messages: messages.slice(-MAX_MESSAGES),
            createdAt: now,
            lastActiveAt: now
        };
        this.discussions.set(discussion.id, discussion);
        return discussion;
    }

    get(id: string, rootPath: string): ReaderTemporaryDiscussion | undefined {
        this.prune();
        const discussion = this.discussions.get(id);
        if (!discussion || discussion.rootPath !== path.resolve(rootPath)) return undefined;
        discussion.lastActiveAt = new Date().toISOString();
        return discussion;
    }

    close(id: string, rootPath: string): void {
        const discussion = this.discussions.get(id);
        if (discussion?.rootPath === path.resolve(rootPath)) this.discussions.delete(id);
    }

    appendMessage(id: string, rootPath: string, message: ReaderTemporaryDiscussionMessage): void {
        const discussion = this.get(id, rootPath);
        if (!discussion) return;
        discussion.messages = [...discussion.messages, message].slice(-MAX_MESSAGES);
    }

    replaceMessages(id: string, rootPath: string, messages: ReaderTemporaryDiscussionMessage[]): void {
        const discussion = this.get(id, rootPath);
        if (!discussion) return;
        discussion.messages = messages.slice(-MAX_MESSAGES);
    }

    clear(rootPath?: string): void {
        if (!rootPath) {
            this.discussions.clear();
            return;
        }
        const normalizedRoot = path.resolve(rootPath);
        this.discussions.forEach((discussion, id) => {
            if (discussion.rootPath === normalizedRoot) this.discussions.delete(id);
        });
    }

    private prune(): void {
        const threshold = Date.now() - MAX_IDLE_MS;
        this.discussions.forEach((discussion, id) => {
            if (Date.parse(discussion.lastActiveAt) < threshold) this.discussions.delete(id);
        });
    }
}
