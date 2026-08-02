import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const os = require('node:os');
const { spawn } = require('node:child_process');

const MAX_RECENT_PROJECTS = 12;

export interface ReaderProjectRecord {
    rootPath: string;
    rootName: string;
    openedAt: string;
}

export interface ReaderProjectRegistryOptions {
    stateFilePath?: string;
    chooseDirectory?: () => Promise<string | undefined>;
}

function defaultStateFilePath(): string {
    const home = os.homedir();
    if (process.platform === 'darwin') {
        return path.join(home, 'Library', 'Application Support', 'markdown-formal', 'reader-projects.json');
    }
    if (process.platform === 'win32') {
        return path.join(process.env.APPDATA || home, 'markdown-formal', 'reader-projects.json');
    }
    return path.join(process.env.XDG_STATE_HOME || path.join(home, '.local', 'state'), 'markdown-formal', 'reader-projects.json');
}

function chooseWith(command: string, args: string[]): Promise<string | undefined> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk: unknown) => { stdout += String(chunk); });
        child.stderr.on('data', (chunk: unknown) => { stderr += String(chunk); });
        child.once('error', reject);
        child.once('close', (code: number) => {
            const selected = stdout.trim();
            if (selected) {
                resolve(selected);
                return;
            }
            if (code === 0 || code === 1 || code === 130) {
                resolve(undefined);
                return;
            }
            reject(new Error(stderr.trim() || `Project chooser exited with status ${code}.`));
        });
    });
}

async function chooseProjectDirectory(): Promise<string | undefined> {
    if (process.platform === 'darwin') {
        return chooseWith('osascript', ['-e', [
            'try',
            'POSIX path of (choose folder with prompt "Choose a Markdown Formal project")',
            'on error number -128',
            'return ""',
            'end try'
        ].join('\n')]);
    }
    if (process.platform === 'win32') {
        return chooseWith('powershell', ['-NoProfile', '-Command', [
            'Add-Type -AssemblyName System.Windows.Forms;',
            '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog;',
            '$dialog.Description = "Choose a Markdown Formal project";',
            'if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dialog.SelectedPath }'
        ].join(' ')]);
    }
    return chooseWith('zenity', ['--file-selection', '--directory', '--title=Choose a Markdown Formal project']);
}

export class ReaderProjectRegistry {
    private readonly stateFilePath: string;
    private readonly chooseDirectory: () => Promise<string | undefined>;

    constructor(options: ReaderProjectRegistryOptions = {}) {
        this.stateFilePath = options.stateFilePath || process.env.MARKDOWN_FORMAL_READER_STATE || defaultStateFilePath();
        this.chooseDirectory = options.chooseDirectory || chooseProjectDirectory;
    }

    async list(): Promise<ReaderProjectRecord[]> {
        const stored = await this.readStored();
        const projects = await Promise.all(stored.map(async project => ({
            project,
            valid: await this.isFormalProject(project.rootPath)
        })));
        return projects
            .filter(({ valid }) => valid)
            .map(({ project }) => ({
                ...project,
                rootName: path.basename(project.rootPath)
            }));
    }

    async choose(): Promise<string | undefined> {
        return this.chooseDirectory();
    }

    async remember(rootPath: string): Promise<ReaderProjectRecord> {
        const resolvedPath = path.resolve(rootPath);
        if (!(await this.isFormalProject(resolvedPath))) {
            throw new Error('Selected directory needs .markdown-formal/config.json. Run `markdown-formal prepare` in the project first.');
        }
        const record: ReaderProjectRecord = {
            rootPath: resolvedPath,
            rootName: path.basename(resolvedPath),
            openedAt: new Date().toISOString()
        };
        const previous = await this.readStored();
        const projects = [record, ...previous.filter(item => item.rootPath !== resolvedPath)].slice(0, MAX_RECENT_PROJECTS);
        try {
            await fs.mkdir(path.dirname(this.stateFilePath), { recursive: true });
            await fs.writeFile(this.stateFilePath, JSON.stringify({ version: 1, projects }, null, 2) + '\n', 'utf8');
        } catch (error) {
            console.warn(`[markdown-formal] Could not save Reader recent projects: ${error instanceof Error ? error.message : String(error)}`);
        }
        return record;
    }

    private async isFormalProject(rootPath: string): Promise<boolean> {
        try {
            return (await fs.stat(path.join(rootPath, '.markdown-formal', 'config.json'))).isFile();
        } catch (_error) {
            return false;
        }
    }

    private async readStored(): Promise<ReaderProjectRecord[]> {
        try {
            const value = JSON.parse(await fs.readFile(this.stateFilePath, 'utf8'));
            if (!Array.isArray(value?.projects)) return [];
            return value.projects.filter((item: any) => (
                typeof item?.rootPath === 'string'
                && typeof item?.openedAt === 'string'
            )).map((item: any) => ({
                rootPath: item.rootPath,
                rootName: typeof item.rootName === 'string' ? item.rootName : path.basename(item.rootPath),
                openedAt: item.openedAt
            }));
        } catch (error: any) {
            if (error?.code === 'ENOENT') return [];
            return [];
        }
    }
}
