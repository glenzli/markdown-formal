import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { mathWorkspaceStatePath } from './local-state';

const nodeFs = require('node:fs');

const MAX_MARKS_PER_PROJECT = 96;

export type ReaderDiscussionMarkKind = 'selection' | 'formula' | 'formal' | 'region';

export interface ReaderDiscussionMarkInput {
    rootPath: string;
    revision: number;
    filePath: string;
    title: string;
    startLine: number;
    endLine: number;
    sourceHash: string;
    kind: ReaderDiscussionMarkKind;
    formalId?: string;
    formulaId?: string;
    /**
     * Character offsets within the rendered source block. They make a normal
     * reader selection precise without persisting any of the selected text.
     */
    startTextOffset?: number;
    endTextOffset?: number;
}

export interface ReaderDiscussionMark extends ReaderDiscussionMarkInput {
    id: string;
    order: number;
    createdAt: string;
}

interface DiscussionMarkState {
    version: 1;
    marks: ReaderDiscussionMark[];
}

export interface ReaderDiscussionMarkStoreOptions {
    stateFilePath?: string;
}

function isKind(value: unknown): value is ReaderDiscussionMarkKind {
    return value === 'selection' || value === 'formula' || value === 'formal' || value === 'region';
}

function isMark(value: unknown): value is ReaderDiscussionMark {
    const mark = value as Partial<ReaderDiscussionMark> | undefined;
    const hasNoTextOffsets = mark?.startTextOffset === undefined && mark?.endTextOffset === undefined;
    const hasValidTextOffsets = Number.isInteger(mark?.startTextOffset)
        && Number.isInteger(mark?.endTextOffset)
        && (mark?.startTextOffset as number) >= 0
        && (mark?.endTextOffset as number) > (mark?.startTextOffset as number);
    return !!mark
        && typeof mark.id === 'string'
        && Number.isInteger(mark.order)
        && typeof mark.createdAt === 'string'
        && typeof mark.rootPath === 'string'
        && typeof mark.revision === 'number'
        && typeof mark.filePath === 'string'
        && typeof mark.title === 'string'
        && Number.isInteger(mark.startLine)
        && Number.isInteger(mark.endLine)
        && typeof mark.sourceHash === 'string'
        && isKind(mark.kind)
        && (hasNoTextOffsets || hasValidTextOffsets);
}

function sameLocation(left: ReaderDiscussionMark, right: ReaderDiscussionMarkInput): boolean {
    return left.rootPath === right.rootPath
        && left.filePath === right.filePath
        && left.startLine === right.startLine
        && left.endLine === right.endLine
        && left.kind === right.kind
        && left.formalId === right.formalId
        && left.formulaId === right.formulaId
        && left.startTextOffset === right.startTextOffset
        && left.endTextOffset === right.endTextOffset;
}

/**
 * Owns the lightweight, local-only set of source locations that a reader has
 * deliberately marked for a native Codex discussion. Marks never duplicate
 * Markdown content and are scoped to one canonical Math Workspace root.
 */
export class ReaderDiscussionMarkStore {
    private readonly stateFilePath: string;

    constructor(options: ReaderDiscussionMarkStoreOptions = {}) {
        this.stateFilePath = options.stateFilePath || process.env.MATH_WORKSPACE_DISCUSSION_MARKS || mathWorkspaceStatePath('discussion-marks.json');
    }

    async add(input: ReaderDiscussionMarkInput): Promise<ReaderDiscussionMark> {
        return (await this.addMany([input]))[0];
    }

    async addMany(inputs: ReaderDiscussionMarkInput[]): Promise<ReaderDiscussionMark[]> {
        if (!inputs.length) return [];
        const stored = await this.read();
        const rootPath = inputs[0].rootPath;
        if (inputs.some(input => input.rootPath !== rootPath)) {
            throw new Error('Discussion marks must be added to one project at a time.');
        }
        const otherProjects = stored.filter(mark => mark.rootPath !== rootPath);
        const projectMarks = stored.filter(mark => mark.rootPath === rootPath);
        const result: ReaderDiscussionMark[] = [];
        let nextOrder = projectMarks.reduce((maximum, item) => Math.max(maximum, item.order), 0);
        for (const input of inputs) {
            const existing = [...projectMarks, ...result].find(mark => sameLocation(mark, input));
            if (existing) {
                result.push(existing);
                continue;
            }
            const mark: ReaderDiscussionMark = {
                ...input,
                id: `mwmark_${crypto.randomBytes(12).toString('hex')}`,
                order: ++nextOrder,
                createdAt: new Date().toISOString()
            };
            result.push(mark);
        }
        const newMarks = Array.from(new Map(result
            .filter(mark => !projectMarks.some(existing => existing.id === mark.id))
            .map(mark => [mark.id, mark] as const)).values());
        if (newMarks.length) {
            await this.write([...otherProjects, ...projectMarks, ...newMarks].filter(mark => (
                mark.rootPath !== rootPath || mark.order > nextOrder - MAX_MARKS_PER_PROJECT
            )));
        }
        return result;
    }

    async list(rootPath: string): Promise<ReaderDiscussionMark[]> {
        return (await this.read())
            .filter(mark => mark.rootPath === rootPath)
            .sort((left, right) => left.order - right.order || left.createdAt.localeCompare(right.createdAt));
    }

    async remove(id: string, rootPath: string): Promise<boolean> {
        const marks = await this.read();
        const next = marks.filter(mark => mark.id !== id || mark.rootPath !== rootPath);
        if (next.length === marks.length) return false;
        await this.write(next);
        return true;
    }

    async clear(rootPath: string): Promise<number> {
        const marks = await this.read();
        const next = marks.filter(mark => mark.rootPath !== rootPath);
        const removed = marks.length - next.length;
        if (removed > 0) await this.write(next);
        return removed;
    }

    private async read(): Promise<ReaderDiscussionMark[]> {
        try {
            const parsed = JSON.parse(await fs.readFile(this.stateFilePath, 'utf8')) as Partial<DiscussionMarkState>;
            return Array.isArray(parsed?.marks) ? parsed.marks.filter(isMark) : [];
        } catch (error: any) {
            if (error?.code === 'ENOENT') return [];
            return [];
        }
    }

    private async write(marks: ReaderDiscussionMark[]): Promise<void> {
        await fs.mkdir(path.dirname(this.stateFilePath), { recursive: true });
        const temporaryPath = `${this.stateFilePath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
        try {
            await fs.writeFile(temporaryPath, JSON.stringify({ version: 1, marks } satisfies DiscussionMarkState, null, 2) + '\n', 'utf8');
            await nodeFs.promises.rename(temporaryPath, this.stateFilePath);
        } catch (error) {
            await nodeFs.promises.unlink(temporaryPath).catch(() => undefined);
            throw error;
        }
    }
}
