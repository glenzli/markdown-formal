const { spawn } = require('node:child_process');

const REQUEST_TIMEOUT_MS = 20_000;
const TURN_TIMEOUT_MS = 5 * 60_000;

export interface CodexThreadSummary {
    id: string;
    cwd: string;
    name: string;
    preview: string;
    updatedAt: number;
    canAcceptDirectInput: boolean | null;
}

export interface CodexAppServerClientOptions {
    command?: string;
}

export interface CodexEphemeralDiscussion {
    threadId: string;
    message: string;
}

export interface CodexDiscussionMessage {
    role: 'user' | 'assistant';
    text: string;
}

interface PendingRequest {
    resolve(value: any): void;
    reject(error: Error): void;
    timer: any;
}

interface ActiveTurn {
    threadId: string;
    turnId?: string;
    text: string;
    queuedDeltas: Array<{ turnId: string; delta: string }>;
    completedTurnIds: Set<string>;
    resolve(value: string): void;
    reject(error: Error): void;
    timer: any;
}

function errorMessage(value: unknown): string {
    if (value && typeof value === 'object' && typeof (value as any).message === 'string') return (value as any).message;
    return typeof value === 'string' ? value : 'Codex app-server request failed.';
}

/**
 * Narrow JSONL adapter for the documented local Codex app-server protocol.
 * The browser never sees Codex credentials or talks to the process directly.
 */
export class CodexAppServerClient {
    private readonly command: string;
    private child: any;
    private startPromise: Promise<void> | undefined;
    private nextRequestId = 1;
    private outputBuffer = '';
    private stderr = '';
    private readonly pending = new Map<number, PendingRequest>();
    private activeTurn: ActiveTurn | undefined;
    private turnStarting = false;

    constructor(options: CodexAppServerClientOptions = {}) {
        this.command = options.command || process.env.MARKDOWN_FORMAL_CODEX_COMMAND || 'codex';
    }

    async listThreads(rootPath: string): Promise<CodexThreadSummary[]> {
        const result = await this.request('thread/list', { cwd: rootPath, limit: 80 });
        const normalizedRoot = this.normalizePath(rootPath);
        return (Array.isArray(result?.data) ? result.data : []).filter((thread: any) => (
            typeof thread?.id === 'string'
            && typeof thread?.cwd === 'string'
            && this.normalizePath(thread.cwd) === normalizedRoot
        )).map((thread: any) => ({
            id: thread.id,
            cwd: thread.cwd,
            name: typeof thread.name === 'string' && thread.name.trim() ? thread.name.trim() : String(thread.preview || '').trim(),
            preview: String(thread.preview || ''),
            updatedAt: Number(thread.updatedAt || 0),
            canAcceptDirectInput: typeof thread.canAcceptDirectInput === 'boolean' ? thread.canAcceptDirectInput : null
        }));
    }

    async sendTurn(threadId: string, rootPath: string, prompt: string, selectionContext: Record<string, unknown>): Promise<string> {
        return this.withTurn(async () => {
            const resumed = await this.request('thread/resume', { threadId, excludeTurns: true });
            if (this.normalizePath(resumed?.cwd || resumed?.thread?.cwd || '') !== this.normalizePath(rootPath)) {
                throw new Error('The bound Codex task no longer belongs to the current project. Bind a task for this project again.');
            }
            return this.startTurn(threadId, prompt, selectionContext);
        });
    }

    async startEphemeralDiscussion(rootPath: string, prompt: string, selectionContext: Record<string, unknown>): Promise<CodexEphemeralDiscussion> {
        return this.withTurn(async () => {
            const started = await this.request('thread/start', {
                cwd: rootPath,
                runtimeWorkspaceRoots: [rootPath],
                ephemeral: true,
                sandbox: 'read-only',
                approvalPolicy: 'never'
            });
            const threadId = typeof started?.thread?.id === 'string' ? started.thread.id : '';
            if (!threadId) throw new Error('Codex app-server returned an ephemeral discussion without an id.');
            return {
                threadId,
                message: await this.startTurn(threadId, prompt, selectionContext)
            };
        });
    }

    async sendEphemeralTurn(threadId: string, prompt: string, selectionContext: Record<string, unknown>): Promise<string> {
        return this.withTurn(() => this.startTurn(threadId, prompt, selectionContext));
    }

    async readEphemeralDiscussion(threadId: string, rootPath: string): Promise<CodexDiscussionMessage[]> {
        const result = await this.request('thread/read', { threadId, includeTurns: true });
        const thread = result?.thread;
        if (this.normalizePath(thread?.cwd || '') !== this.normalizePath(rootPath)) {
            throw new Error('The temporary Codex discussion no longer belongs to the current project.');
        }

        const messages: CodexDiscussionMessage[] = [];
        const turns = Array.isArray(thread?.turns) ? thread.turns : [];
        turns.forEach((turn: any) => {
            const items = Array.isArray(turn?.items) ? turn.items : [];
            items.forEach((item: any) => {
                if (item?.type === 'userMessage') {
                    const text = Array.isArray(item.content)
                        ? item.content
                            .filter((content: any) => content?.type === 'text' && typeof content.text === 'string')
                            .map((content: any) => content.text)
                            .join('\n')
                            .trim()
                        : '';
                    if (text) messages.push({ role: 'user', text });
                    return;
                }
                if (item?.type === 'agentMessage' && typeof item.text === 'string' && item.text.trim()) {
                    messages.push({ role: 'assistant', text: item.text.trim() });
                }
            });
        });
        return messages;
    }

    async close(): Promise<void> {
        this.fail(new Error('Codex Reader bridge closed.'));
        const child = this.child;
        this.child = undefined;
        this.startPromise = undefined;
        if (!child || child.exitCode !== null) return;
        await new Promise<void>(resolve => {
            child.once('exit', () => resolve());
            child.kill('SIGTERM');
            setTimeout(() => {
                if (child.exitCode === null) child.kill('SIGKILL');
                resolve();
            }, 1500);
        });
    }

    private async request(method: string, params: unknown, timeoutMs = REQUEST_TIMEOUT_MS): Promise<any> {
        await this.start();
        const id = this.nextRequestId++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`Codex app-server timed out while handling ${method}.`));
            }, timeoutMs);
            this.pending.set(id, { resolve, reject, timer });
            try {
                this.write({ method, id, params });
            } catch (error) {
                clearTimeout(timer);
                this.pending.delete(id);
                reject(error instanceof Error ? error : new Error(String(error)));
            }
        });
    }

    private async withTurn<T>(operation: () => Promise<T>): Promise<T> {
        if (this.activeTurn || this.turnStarting) throw new Error('A Codex task turn is already in progress.');
        this.turnStarting = true;
        try {
            return await operation();
        } finally {
            this.turnStarting = false;
        }
    }

    private async startTurn(threadId: string, prompt: string, selectionContext: Record<string, unknown>): Promise<string> {
        const result = await new Promise<string>((resolve, reject) => {
            const activeTurn: ActiveTurn = {
                threadId,
                text: '',
                queuedDeltas: [],
                completedTurnIds: new Set<string>(),
                resolve,
                reject,
                timer: setTimeout(() => {
                    this.finishTurn(activeTurn, new Error('Codex did not complete the task turn in time.'));
                }, TURN_TIMEOUT_MS)
            };
            this.activeTurn = activeTurn;
            void this.request('turn/start', {
                threadId,
                input: [{ type: 'text', text: prompt, text_elements: [] }],
                additionalContext: {
                    'markdown-formal-reader-selection': {
                        kind: 'untrusted',
                        value: JSON.stringify(selectionContext)
                    }
                }
            }, TURN_TIMEOUT_MS).then(response => {
                if (this.activeTurn !== activeTurn) return;
                const turnId = typeof response?.turn?.id === 'string' ? response.turn.id : '';
                if (!turnId) {
                    this.finishTurn(activeTurn, new Error('Codex app-server returned a turn without an id.'));
                    return;
                }
                activeTurn.turnId = turnId;
                activeTurn.queuedDeltas.forEach(item => {
                    if (item.turnId === turnId) activeTurn.text += item.delta;
                });
                activeTurn.queuedDeltas = [];
                if (activeTurn.completedTurnIds.has(turnId)) this.finishTurn(activeTurn);
            }, error => this.finishTurn(activeTurn, error instanceof Error ? error : new Error(String(error))));
        });
        return result.trim();
    }

    private async start(): Promise<void> {
        if (this.startPromise) return this.startPromise;
        if (this.child && this.child.exitCode === null) return;
        this.startPromise = new Promise<void>((resolve, reject) => {
            const child = spawn(this.command, ['app-server'], { stdio: ['pipe', 'pipe', 'pipe'] });
            this.child = child;
            this.outputBuffer = '';
            this.stderr = '';
            child.stdout.setEncoding?.('utf8');
            child.stderr.setEncoding?.('utf8');
            child.stdout.on('data', (chunk: unknown) => this.receive(String(chunk)));
            child.stderr.on('data', (chunk: unknown) => {
                this.stderr = (this.stderr + String(chunk)).slice(-4000);
            });
            child.once('error', (error: Error) => {
                this.fail(error);
                reject(new Error(`Could not start Codex app-server: ${error.message}`));
            });
            child.once('exit', (code: number) => {
                const detail = this.stderr.trim();
                const error = new Error(detail || `Codex app-server exited with status ${code}.`);
                this.fail(error);
            });

            const id = this.nextRequestId++;
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error('Codex app-server did not finish initialization in time.'));
            }, REQUEST_TIMEOUT_MS);
            this.pending.set(id, {
                resolve: () => {
                    clearTimeout(timer);
                    try {
                        this.write({ method: 'initialized', params: {} });
                        resolve();
                    } catch (error) {
                        reject(error instanceof Error ? error : new Error(String(error)));
                    }
                },
                reject: error => {
                    clearTimeout(timer);
                    reject(error);
                },
                timer
            });
            try {
                this.write({
                    method: 'initialize',
                    id,
                    params: {
                        clientInfo: {
                            name: 'markdown_formal_reader',
                            title: 'Markdown Formal Reader',
                            version: '0.1.0'
                        }
                    }
                });
            } catch (error) {
                clearTimeout(timer);
                this.pending.delete(id);
                reject(error instanceof Error ? error : new Error(String(error)));
            }
        }).finally(() => {
            this.startPromise = undefined;
        });
        return this.startPromise;
    }

    private receive(chunk: string): void {
        this.outputBuffer += chunk;
        let lineBreak = this.outputBuffer.indexOf('\n');
        while (lineBreak >= 0) {
            const line = this.outputBuffer.slice(0, lineBreak).trim();
            this.outputBuffer = this.outputBuffer.slice(lineBreak + 1);
            if (line) {
                try {
                    this.receiveMessage(JSON.parse(line));
                } catch (_error) {
                    // Ignore malformed diagnostics. The server protocol itself is JSONL.
                }
            }
            lineBreak = this.outputBuffer.indexOf('\n');
        }
    }

    private receiveMessage(message: any): void {
        if (typeof message?.id === 'number' && ('result' in message || 'error' in message)) {
            const pending = this.pending.get(message.id);
            if (!pending) return;
            this.pending.delete(message.id);
            clearTimeout(pending.timer);
            if (message.error) pending.reject(new Error(errorMessage(message.error)));
            else pending.resolve(message.result);
            return;
        }

        if (typeof message?.id === 'number' && typeof message?.method === 'string') {
            this.write({
                id: message.id,
                error: {
                    code: -32000,
                    message: 'Markdown Formal Reader does not surface Codex tool approvals. Continue this task in Codex to approve tool actions.'
                }
            });
            return;
        }

        const activeTurn = this.activeTurn;
        if (!activeTurn || message?.params?.threadId !== activeTurn.threadId) return;
        if (message.method === 'item/agentMessage/delta' && typeof message.params?.delta === 'string') {
            if (activeTurn.turnId && message.params.turnId === activeTurn.turnId) {
                activeTurn.text += message.params.delta;
            } else if (!activeTurn.turnId && typeof message.params.turnId === 'string') {
                activeTurn.queuedDeltas.push({ turnId: message.params.turnId, delta: message.params.delta });
            }
            return;
        }
        if (message.method === 'turn/completed' && typeof message.params?.turn?.id === 'string') {
            if (activeTurn.turnId === message.params.turn.id) this.finishTurn(activeTurn);
            else activeTurn.completedTurnIds.add(message.params.turn.id);
        }
    }

    private finishTurn(turn: ActiveTurn, error?: Error): void {
        if (this.activeTurn !== turn) return;
        this.activeTurn = undefined;
        clearTimeout(turn.timer);
        if (error) turn.reject(error);
        else turn.resolve(turn.text || '');
    }

    private write(message: unknown): void {
        if (!this.child?.stdin?.writable) throw new Error('Codex app-server is not available.');
        this.child.stdin.write(JSON.stringify(message) + '\n');
    }

    private fail(error: Error): void {
        this.pending.forEach(pending => {
            clearTimeout(pending.timer);
            pending.reject(error);
        });
        this.pending.clear();
        if (this.activeTurn) this.finishTurn(this.activeTurn, error);
    }

    private normalizePath(value: string): string {
        const path = require('node:path');
        return value ? path.resolve(value) : '';
    }
}
