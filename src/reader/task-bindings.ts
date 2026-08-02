import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const os = require('node:os');

export interface ReaderTaskBinding {
    rootPath: string;
    taskId: string;
    taskName: string;
    boundAt: string;
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

    async get(rootPath: string): Promise<ReaderTaskBinding | undefined> {
        const normalizedRoot = path.resolve(rootPath);
        return (await this.readStored()).find(binding => binding.rootPath === normalizedRoot);
    }

    async bind(rootPath: string, taskId: string, taskName: string): Promise<ReaderTaskBinding> {
        const binding: ReaderTaskBinding = {
            rootPath: path.resolve(rootPath),
            taskId,
            taskName,
            boundAt: new Date().toISOString()
        };
        const previous = await this.readStored();
        await this.writeStored([binding, ...previous.filter(item => item.rootPath !== binding.rootPath)]);
        return binding;
    }

    async clear(rootPath: string): Promise<void> {
        const normalizedRoot = path.resolve(rootPath);
        const previous = await this.readStored();
        await this.writeStored(previous.filter(item => item.rootPath !== normalizedRoot));
    }

    private async writeStored(bindings: ReaderTaskBinding[]): Promise<void> {
        try {
            await fs.mkdir(path.dirname(this.stateFilePath), { recursive: true });
            await fs.writeFile(this.stateFilePath, JSON.stringify({ version: 1, bindings }, null, 2) + '\n', 'utf8');
        } catch (error) {
            console.warn(`[markdown-formal] Could not save Reader task bindings: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async readStored(): Promise<ReaderTaskBinding[]> {
        try {
            const value = JSON.parse(await fs.readFile(this.stateFilePath, 'utf8'));
            if (!Array.isArray(value?.bindings)) return [];
            return value.bindings.filter((item: any) => (
                typeof item?.rootPath === 'string'
                && typeof item?.taskId === 'string'
                && typeof item?.taskName === 'string'
                && typeof item?.boundAt === 'string'
            )).map((item: any) => ({
                rootPath: path.resolve(item.rootPath),
                taskId: item.taskId,
                taskName: item.taskName,
                boundAt: item.boundAt
            }));
        } catch (error: any) {
            if (error?.code === 'ENOENT') return [];
            return [];
        }
    }
}
