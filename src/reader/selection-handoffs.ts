import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { mathWorkspaceStatePath } from './local-state';

const nodeFs = require('node:fs');

const HANDOFF_ID = /^mwsel_[a-f0-9]{24}$/;
const HANDOFF_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_HANDOFFS = 96;

export interface ReaderSelectionHandoffInput {
    rootPath: string;
    revision: number;
    filePath: string;
    title: string;
    startLine: number;
    endLine: number;
    markdown: string;
    text: string;
    sourceLines: string;
    directReferences: string[];
    anchors: string[];
}

export interface ReaderSelectionHandoff extends ReaderSelectionHandoffInput {
    id: string;
    createdAt: string;
    expiresAt: string;
    sourceHash: string;
}

interface StoredHandoffs {
    version: 1;
    handoffs: ReaderSelectionHandoff[];
}

export interface ReaderSelectionHandoffStoreOptions {
    stateFilePath?: string;
    now?: () => Date;
}

function hash(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
}

async function canonicalRoot(rootPath: string): Promise<string> {
    const resolved = path.resolve(rootPath);
    try {
        return await nodeFs.promises.realpath(resolved);
    } catch (_error) {
        return resolved;
    }
}

function isRecord(value: unknown): value is ReaderSelectionHandoff {
    const item = value as Partial<ReaderSelectionHandoff> | undefined;
    return !!item
        && typeof item.id === 'string'
        && HANDOFF_ID.test(item.id)
        && typeof item.rootPath === 'string'
        && typeof item.filePath === 'string'
        && typeof item.createdAt === 'string'
        && typeof item.expiresAt === 'string'
        && typeof item.sourceHash === 'string';
}

/**
 * A short-lived, local-only handoff bridge between the Reader browser process
 * and the MCP process. It deliberately stores source pointers, not dialogue.
 */
export class ReaderSelectionHandoffStore {
    private readonly stateFilePath: string;
    private readonly now: () => Date;

    constructor(options: ReaderSelectionHandoffStoreOptions = {}) {
        this.stateFilePath = options.stateFilePath || process.env.MATH_WORKSPACE_HANDOFFS || mathWorkspaceStatePath('selection-handoffs.json');
        this.now = options.now || (() => new Date());
    }

    async create(input: ReaderSelectionHandoffInput): Promise<ReaderSelectionHandoff> {
        const now = this.now();
        const current = await this.read();
        const handoff: ReaderSelectionHandoff = {
            ...input,
            rootPath: await canonicalRoot(input.rootPath),
            id: `mwsel_${crypto.randomBytes(12).toString('hex')}`,
            createdAt: now.toISOString(),
            expiresAt: new Date(now.getTime() + HANDOFF_TTL_MS).toISOString(),
            sourceHash: hash(input.sourceLines)
        };
        const active = current.filter(item => this.isActive(item, now));
        await this.write([...active, handoff].slice(-MAX_HANDOFFS));
        return handoff;
    }

    async get(id: string, rootPath: string): Promise<ReaderSelectionHandoff | undefined> {
        if (!HANDOFF_ID.test(id)) return undefined;
        const now = this.now();
        const root = await canonicalRoot(rootPath);
        return (await this.read()).find(item => item.id === id && item.rootPath === root && this.isActive(item, now));
    }

    private isActive(item: ReaderSelectionHandoff, now: Date): boolean {
        return Number.isFinite(Date.parse(item.expiresAt)) && Date.parse(item.expiresAt) > now.getTime();
    }

    private async read(): Promise<ReaderSelectionHandoff[]> {
        try {
            const parsed = JSON.parse(await fs.readFile(this.stateFilePath, 'utf8')) as StoredHandoffs;
            return Array.isArray(parsed?.handoffs) ? parsed.handoffs.filter(isRecord) : [];
        } catch (error: any) {
            if (error?.code === 'ENOENT') return [];
            return [];
        }
    }

    private async write(handoffs: ReaderSelectionHandoff[]): Promise<void> {
        await fs.mkdir(path.dirname(this.stateFilePath), { recursive: true });
        const temporaryPath = `${this.stateFilePath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
        try {
            await fs.writeFile(temporaryPath, JSON.stringify({ version: 1, handoffs }, null, 2) + '\n', 'utf8');
            await nodeFs.promises.rename(temporaryPath, this.stateFilePath);
        } catch (error) {
            await nodeFs.promises.unlink(temporaryPath).catch(() => undefined);
            throw error;
        }
    }
}
