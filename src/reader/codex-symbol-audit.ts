import type {
    SymbolAuditAdvisory,
    SymbolAuditBinding,
    SymbolAuditCandidate,
    SymbolAuditSettings,
    SymbolAuditSource
} from './symbol-audit';

const { spawn } = require('node:child_process');

const REQUEST_TIMEOUT_MS = 20_000;
const TURN_TIMEOUT_MS = 9 * 60_000;

export interface CodexSymbolAuditModel {
    id: string;
    model: string;
    displayName: string;
    description: string;
    isDefault: boolean;
    defaultReasoningEffort: string;
    supportedReasoningEfforts: Array<{ reasoningEffort: string; description: string }>;
}

export interface CodexSymbolAuditRunnerOptions {
    command?: string;
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

function parseJsonObject(value: string): Record<string, unknown> {
    const trimmed = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch (_error) {
        // A model can still add a short introduction despite the output schema.
    }
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
        try {
            const parsed = JSON.parse(trimmed.slice(start, end + 1));
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
        } catch (_error) {
            // The error below states the stable boundary rather than model prose.
        }
    }
    throw new Error('Codex did not return the required JSON symbol-audit result.');
}

function promptForExtraction(source: SymbolAuditSource): string {
    const registered = source.registeredSymbols.map(symbol => ({
        expression: symbol.display || symbol.pattern,
        pattern: symbol.pattern,
        meaning: symbol.meaning,
        scope: symbol.scope,
        line: symbol.sourceLine
    }));
    return [
        'You are Math Workspace’s notation extraction pass. Inspect exactly one Markdown source file and return only the JSON object required by the output schema.',
        'Extract every project-relevant mathematical symbol binding in this file, including declared special notation and temporary/local notation. A binding is a notation-to-meaning assignment, not merely a glyph occurrence.',
        'Use kind="special" for project-defined or deliberately named notation; use kind="temporary" for local derivation notation. Include temporary constants and temporary symbols even if they are intentionally absent from the maintained symbols.json table.',
        'For each binding, give expression without outer dollar delimiters; normalizedExpression is not needed. Give structure.base and modifiers (subscripts, superscripts, decorations, indices), a short globally comparable bindingKey in kebab-case, semanticType, concise Chinese meaning, source line range, evidence, and confidence.',
        'Do not include universal syntax such as +, =, \\in, parentheses, generic quantifier syntax, or a dummy binder that has no distinct local meaning. Treat the same expression with a genuinely different local meaning as a separate binding.',
        'Every registered special symbol listed below must be represented as a special binding when it is defined or used by this source. Do not reinterpret a temporary symbol as a later special symbol just because their glyphs match.',
        `Source path: ${source.filePath}`,
        'Registered special symbols from the maintained table:',
        JSON.stringify(registered),
        'Source Markdown follows between the delimiters:',
        '--- BEGIN SOURCE ---',
        source.content,
        '--- END SOURCE ---'
    ].join('\n\n');
}

function promptForAdvisory(candidates: SymbolAuditCandidate[]): string {
    return [
        'You are Math Workspace’s notation-confusion review pass. Return only the JSON object required by the output schema.',
        'Each group below has the same temporary surface notation but distinct extracted meanings. Assess whether reusing it is likely to confuse a reader crossing the cited source locations.',
        'Return an advisory only when the semantic roles are materially different enough to warrant human review. Do not call ordinary local reuse a conflict. This is advisory only; do not propose source edits.',
        'Candidate groups:',
        JSON.stringify(candidates.map(candidate => ({
            expression: candidate.expression,
            bindings: candidate.bindings.map(binding => ({
                filePath: binding.filePath,
                startLine: binding.startLine,
                kind: binding.kind,
                bindingKey: binding.bindingKey,
                semanticType: binding.semanticType,
                meaning: binding.meaning
            }))
        })))
    ].join('\n\n');
}

const EXTRACTION_OUTPUT_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['bindings'],
    properties: {
        bindings: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['expression', 'startLine', 'endLine', 'structure', 'kind', 'scope', 'bindingKey', 'semanticType', 'meaning', 'evidence', 'confidence'],
                properties: {
                    expression: { type: 'string' },
                    startLine: { type: 'integer' },
                    endLine: { type: 'integer' },
                    structure: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['base', 'modifiers'],
                        properties: {
                            base: { type: 'string' },
                            modifiers: { type: 'array', items: { type: 'string' } }
                        }
                    },
                    kind: { type: 'string', enum: ['special', 'temporary'] },
                    scope: { type: 'string', enum: ['book', 'chapter', 'section', 'local'] },
                    bindingKey: { type: 'string' },
                    semanticType: { type: 'string' },
                    meaning: { type: 'string' },
                    evidence: { type: 'string' },
                    confidence: { type: 'string', enum: ['high', 'medium', 'low'] }
                }
            }
        }
    }
};

const ADVISORY_OUTPUT_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['advisories'],
    properties: {
        advisories: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['expression', 'severity', 'reason', 'bindingKeys'],
                properties: {
                    expression: { type: 'string' },
                    severity: { type: 'string', enum: ['notice', 'review'] },
                    reason: { type: 'string' },
                    bindingKeys: { type: 'array', items: { type: 'string' } }
                }
            }
        }
    }
};

/**
 * A tiny local adapter for the documented app-server protocol. It creates
 * only ephemeral, read-only audit turns; it does not attempt to bridge or
 * persist a user’s native Codex task history.
 */
export class CodexSymbolAuditRunner {
    private readonly command: string;
    private child: any;
    private startPromise: Promise<void> | undefined;
    private nextRequestId = 1;
    private outputBuffer = '';
    private stderr = '';
    private readonly pending = new Map<number, PendingRequest>();
    private activeTurn: ActiveTurn | undefined;
    private turnStarting = false;

    constructor(options: CodexSymbolAuditRunnerOptions = {}) {
        this.command = options.command || process.env.MATH_WORKSPACE_CODEX_COMMAND || 'codex';
    }

    async listModels(): Promise<CodexSymbolAuditModel[]> {
        const models: CodexSymbolAuditModel[] = [];
        let cursor: string | undefined;
        do {
            const result = await this.request('model/list', { ...(cursor ? { cursor } : {}), limit: 100 });
            const data = Array.isArray(result?.data) ? result.data : [];
            data.forEach((raw: any) => {
                if (!raw || raw.hidden || typeof raw.model !== 'string') return;
                const efforts = Array.isArray(raw.supportedReasoningEfforts) ? raw.supportedReasoningEfforts
                    .filter((item: any) => typeof item?.reasoningEffort === 'string')
                    .map((item: any) => ({ reasoningEffort: item.reasoningEffort, description: typeof item.description === 'string' ? item.description : '' }))
                    : [];
                models.push({
                    id: typeof raw.id === 'string' ? raw.id : raw.model,
                    model: raw.model,
                    displayName: typeof raw.displayName === 'string' ? raw.displayName : raw.model,
                    description: typeof raw.description === 'string' ? raw.description : '',
                    isDefault: raw.isDefault === true,
                    defaultReasoningEffort: typeof raw.defaultReasoningEffort === 'string' ? raw.defaultReasoningEffort : efforts[0]?.reasoningEffort || '',
                    supportedReasoningEfforts: efforts
                });
            });
            cursor = typeof result?.nextCursor === 'string' && result.nextCursor ? result.nextCursor : undefined;
        } while (cursor);
        return models.sort((left, right) => Number(right.isDefault) - Number(left.isDefault) || left.displayName.localeCompare(right.displayName));
    }

    async extract(rootPath: string, source: SymbolAuditSource, settings: SymbolAuditSettings): Promise<unknown> {
        const result = await this.startEphemeralTurn(rootPath, promptForExtraction(source), settings, EXTRACTION_OUTPUT_SCHEMA);
        return parseJsonObject(result).bindings;
    }

    async reviewTemporaryCandidates(rootPath: string, candidates: SymbolAuditCandidate[], settings: SymbolAuditSettings): Promise<SymbolAuditAdvisory[]> {
        if (!candidates.length) return [];
        const result = await this.startEphemeralTurn(rootPath, promptForAdvisory(candidates), settings, ADVISORY_OUTPUT_SCHEMA);
        const rawAdvisories = parseJsonObject(result).advisories;
        if (!Array.isArray(rawAdvisories)) return [];
        return rawAdvisories.flatMap((item: unknown) => {
            const value = item && typeof item === 'object' ? item as Record<string, unknown> : {};
            const expression = typeof value.expression === 'string' ? value.expression.trim().slice(0, 160) : '';
            const severity = value.severity === 'review' ? 'review' : value.severity === 'notice' ? 'notice' : undefined;
            const reason = typeof value.reason === 'string' ? value.reason.trim().slice(0, 560) : '';
            const bindingKeys = Array.isArray(value.bindingKeys)
                ? value.bindingKeys.filter((key): key is string => typeof key === 'string' && key.length > 0).slice(0, 32)
                : [];
            return expression && severity && reason && bindingKeys.length ? [{ expression, severity, reason, bindingKeys }] : [];
        });
    }

    async interrupt(): Promise<void> {
        const active = this.activeTurn;
        if (!active?.turnId) return;
        await this.request('turn/interrupt', { threadId: active.threadId, turnId: active.turnId }).catch(() => undefined);
        this.finishTurn(active, new Error('Symbol audit was cancelled.'));
    }

    async close(): Promise<void> {
        this.fail(new Error('Codex symbol-audit bridge closed.'));
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

    private async startEphemeralTurn(rootPath: string, prompt: string, settings: SymbolAuditSettings, outputSchema: Record<string, unknown>): Promise<string> {
        return this.withTurn(async () => {
            const started = await this.request('thread/start', {
                cwd: rootPath,
                ephemeral: true,
                sandbox: 'read-only',
                approvalPolicy: 'never',
                ...(settings.model ? { model: settings.model } : {})
            });
            const threadId = typeof started?.thread?.id === 'string' ? started.thread.id : '';
            if (!threadId) throw new Error('Codex app-server returned an ephemeral audit without a task id.');
            return this.startTurn(threadId, prompt, settings, outputSchema);
        });
    }

    private async startTurn(threadId: string, prompt: string, settings: SymbolAuditSettings, outputSchema: Record<string, unknown>): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            const activeTurn: ActiveTurn = {
                threadId,
                text: '',
                queuedDeltas: [],
                completedTurnIds: new Set<string>(),
                resolve,
                reject,
                timer: setTimeout(() => this.finishTurn(activeTurn, new Error('Codex did not complete the symbol audit in time.')), TURN_TIMEOUT_MS)
            };
            this.activeTurn = activeTurn;
            const params = {
                threadId,
                input: [{ type: 'text', text: prompt, text_elements: [] }],
                outputSchema,
                ...(settings.model ? { model: settings.model } : {}),
                ...(settings.effort ? { effort: settings.effort } : {})
            };
            void this.request('turn/start', params, TURN_TIMEOUT_MS).then(response => {
                if (this.activeTurn !== activeTurn) return;
                const turnId = typeof response?.turn?.id === 'string' ? response.turn.id : '';
                if (!turnId) {
                    this.finishTurn(activeTurn, new Error('Codex app-server returned an audit turn without an id.'));
                    return;
                }
                activeTurn.turnId = turnId;
                activeTurn.queuedDeltas.forEach(item => {
                    if (item.turnId === turnId) activeTurn.text += item.delta;
                });
                activeTurn.queuedDeltas = [];
                if (activeTurn.completedTurnIds.has(turnId)) this.finishTurn(activeTurn);
            }, error => this.finishTurn(activeTurn, error instanceof Error ? error : new Error(String(error))));
        }).then(result => result.trim());
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
        if (this.activeTurn || this.turnStarting) throw new Error('A symbol audit is already in progress.');
        this.turnStarting = true;
        try {
            return await operation();
        } finally {
            this.turnStarting = false;
        }
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
            child.stderr.on('data', (chunk: unknown) => { this.stderr = (this.stderr + String(chunk)).slice(-4000); });
            child.once('error', (error: Error) => {
                this.fail(error);
                reject(new Error(`Could not start Codex app-server: ${error.message}`));
            });
            child.once('exit', (code: number) => {
                this.fail(new Error(this.stderr.trim() || `Codex app-server exited with status ${code}.`));
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
                        clientInfo: { name: 'math_workspace', title: 'Math Workspace', version: '0.1.0' },
                        capabilities: { experimentalApi: true }
                    }
                });
            } catch (error) {
                clearTimeout(timer);
                this.pending.delete(id);
                reject(error instanceof Error ? error : new Error(String(error)));
            }
        }).finally(() => { this.startPromise = undefined; });
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
                    // app-server uses JSONL; ignore non-protocol diagnostics.
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
                error: { code: -32000, message: 'Math Workspace symbol audits are read-only and do not surface tool approvals.' }
            });
            return;
        }
        const activeTurn = this.activeTurn;
        if (!activeTurn || message?.params?.threadId !== activeTurn.threadId) return;
        if (message.method === 'item/agentMessage/delta' && typeof message.params?.delta === 'string') {
            if (activeTurn.turnId && message.params.turnId === activeTurn.turnId) activeTurn.text += message.params.delta;
            else if (!activeTurn.turnId && typeof message.params.turnId === 'string') activeTurn.queuedDeltas.push({ turnId: message.params.turnId, delta: message.params.delta });
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
}
