import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const os = require('node:os');

export interface ReaderTaskBinding {
    taskId: string;
    taskName: string;
    boundAt: string;
}

/** A project-local collection with one stable default task. */
export interface ReaderTaskBindings {
    rootPath: string;
    primaryTaskId: string;
    tasks: ReaderTaskBinding[];
}

export interface ReaderTaskBindingRegistryOptions {
    stateFilePath?: string;
}

function defaultStateFilePath(): string {
    const home = os.homedir();
    if (process.platform === 'darwin') {
        return path.join(home, 'Library', 'Application Support', 'markdown-formal', 'reader-task-bindings.json');
    }
    if (process.platform === 'win32') {
        return path.join(process.env.APPDATA || home, 'markdown-formal', 'reader-task-bindings.json');
    }
    return path.join(process.env.XDG_STATE_HOME || path.join(home, '.local', 'state'), 'markdown-formal', 'reader-task-bindings.json');
}

export class ReaderTaskBindingRegistry {
    private readonly stateFilePath: string;

    constructor(options: ReaderTaskBindingRegistryOptions = {}) {
        this.stateFilePath = options.stateFilePath || process.env.MARKDOWN_FORMAL_READER_TASKS || defaultStateFilePath();
    }

    async get(rootPath: string): Promise<ReaderTaskBindings | undefined> {
        const normalizedRoot = path.resolve(rootPath);
        return (await this.readStored()).find(binding => binding.rootPath === normalizedRoot);
    }

    async bind(rootPath: string, taskId: string, taskName: string, primary = false): Promise<ReaderTaskBindings> {
        const normalizedRoot = path.resolve(rootPath);
        const previous = await this.readStored();
        const existing = previous.find(binding => binding.rootPath === normalizedRoot);
        const priorTask = existing?.tasks.find(task => task.taskId === taskId);
        const task: ReaderTaskBinding = {
            taskId,
            taskName,
            boundAt: priorTask?.boundAt || new Date().toISOString()
        };
        const tasks = (existing?.tasks || []).filter(item => item.taskId !== taskId);
        tasks.push(task);
        const binding: ReaderTaskBindings = {
            rootPath: normalizedRoot,
            primaryTaskId: primary || !existing ? taskId : existing.primaryTaskId,
            tasks
        };
        await this.writeStored([binding, ...previous.filter(item => item.rootPath !== normalizedRoot)]);
        return binding;
    }

    async remove(rootPath: string, taskId: string): Promise<ReaderTaskBindings | undefined> {
        const normalizedRoot = path.resolve(rootPath);
        const previous = await this.readStored();
        const existing = previous.find(binding => binding.rootPath === normalizedRoot);
        if (!existing) return undefined;
        const tasks = existing.tasks.filter(task => task.taskId !== taskId);
        if (tasks.length === 0) {
            await this.writeStored(previous.filter(item => item.rootPath !== normalizedRoot));
            return undefined;
        }
        const binding: ReaderTaskBindings = {
            rootPath: normalizedRoot,
            primaryTaskId: existing.primaryTaskId === taskId ? tasks[0].taskId : existing.primaryTaskId,
            tasks
        };
        await this.writeStored([binding, ...previous.filter(item => item.rootPath !== normalizedRoot)]);
        return binding;
    }

    async clear(rootPath: string): Promise<void> {
        const normalizedRoot = path.resolve(rootPath);
        const previous = await this.readStored();
        await this.writeStored(previous.filter(item => item.rootPath !== normalizedRoot));
    }

    private async writeStored(bindings: ReaderTaskBindings[]): Promise<void> {
        try {
            await fs.mkdir(path.dirname(this.stateFilePath), { recursive: true });
            await fs.writeFile(this.stateFilePath, JSON.stringify({ version: 2, bindings }, null, 2) + '\n', 'utf8');
        } catch (error) {
            console.warn(`[markdown-formal] Could not save Reader task bindings: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async readStored(): Promise<ReaderTaskBindings[]> {
        try {
            const value = JSON.parse(await fs.readFile(this.stateFilePath, 'utf8'));
            if (!Array.isArray(value?.bindings)) return [];
            return value.bindings.map((item: any) => this.readBinding(item)).filter((item: ReaderTaskBindings | undefined): item is ReaderTaskBindings => !!item);
        } catch (error: any) {
            if (error?.code === 'ENOENT') return [];
            return [];
        }
    }

    /** Accepts the former one-task-on-each-project file format on read. */
    private readBinding(value: any): ReaderTaskBindings | undefined {
        if (typeof value?.rootPath !== 'string') return undefined;
        const readTask = (task: any): ReaderTaskBinding | undefined => (
            typeof task?.taskId === 'string'
            && typeof task?.taskName === 'string'
            && typeof task?.boundAt === 'string'
        ) ? { taskId: task.taskId, taskName: task.taskName, boundAt: task.boundAt } : undefined;

        const candidates = Array.isArray(value.tasks)
            ? value.tasks.map(readTask)
            : [readTask(value)];
        const tasks = candidates.filter((task: ReaderTaskBinding | undefined): task is ReaderTaskBinding => !!task)
            .filter((task, index, items) => items.findIndex(item => item.taskId === task.taskId) === index);
        if (!tasks.length) return undefined;
        const requestedPrimary = typeof value.primaryTaskId === 'string' ? value.primaryTaskId : '';
        return {
            rootPath: path.resolve(value.rootPath),
            primaryTaskId: tasks.some(task => task.taskId === requestedPrimary) ? requestedPrimary : tasks[0].taskId,
            tasks
        };
    }
}
