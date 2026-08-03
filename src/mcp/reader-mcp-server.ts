import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { startReaderServer, type FormalReaderServer } from '../reader/server';

export interface ReaderMcpServerOptions {
    rootPath?: string;
    port?: number;
}

interface ReaderLaunch extends Record<string, unknown> {
    rootPath?: string;
    pagePath?: string;
    url: string;
}

async function isFormalProject(rootPath: string): Promise<boolean> {
    try {
        return (await fs.stat(path.join(rootPath, '.math-workspace', 'config.json'))).isFile();
    } catch (_error) {
        return false;
    }
}

function normalizePagePath(value: string | undefined): string | undefined {
    if (!value) return undefined;
    const normalized = value.trim().replaceAll('\\', '/').replace(/^\/+/, '');
    if (!normalized || normalized.split('/').some(part => part === '..') || !normalized.toLowerCase().endsWith('.md')) {
        throw new Error('pagePath must be a project-relative Markdown path.');
    }
    return normalized;
}

class ReaderServerRegistry {
    private readonly servers = new Map<string, FormalReaderServer>();

    constructor(private readonly options: ReaderMcpServerOptions) {}

    async open(projectRoot?: string, pagePath?: string): Promise<ReaderLaunch> {
        const requestedRoot = projectRoot || this.options.rootPath || process.cwd();
        const rootPath = path.resolve(requestedRoot);
        const page = normalizePagePath(pagePath);

        if (!(await isFormalProject(rootPath))) {
            if (projectRoot || this.options.rootPath) {
                throw new Error('The Math Workspace project needs .math-workspace/config.json. Run `math-workspace prepare` first.');
            }
            return this.openLauncher();
        }

        const key = `project:${rootPath}`;
        let reader = this.servers.get(key);
        if (!reader) {
            reader = await startReaderServer({ rootPath, port: this.options.port || 0 });
            this.servers.set(key, reader);
        }
        const url = page ? `${reader.url}/?path=${encodeURIComponent(page)}` : reader.url;
        return { rootPath, pagePath: page, url };
    }

    async close(): Promise<void> {
        const servers = Array.from(this.servers.values());
        this.servers.clear();
        await Promise.all(servers.map(server => server.close()));
    }

    private async openLauncher(): Promise<ReaderLaunch> {
        const key = 'launcher';
        let reader = this.servers.get(key);
        if (!reader) {
            reader = await startReaderServer({ port: this.options.port || 0 });
            this.servers.set(key, reader);
        }
        return { url: reader.url };
    }
}

export async function runReaderMcpServer(options: ReaderMcpServerOptions = {}): Promise<void> {
    const registry = new ReaderServerRegistry(options);
    const server = new McpServer({
        name: 'math-workspace',
        version: '0.1.0'
    }, {
        instructions: 'Use math_workspace to launch Math Workspace for a prepared formal Markdown project. Math Workspace is local-only and read-only; it needs .math-workspace/config.json.'
    });

    server.registerTool('math_workspace', {
        title: 'Open Math Workspace',
        description: 'Start or reuse the local Math Workspace for a prepared project, optionally opening one Markdown page.',
        inputSchema: {
            projectRoot: z.string().optional().describe('Absolute or relative root of a project containing .math-workspace/config.json. Defaults to the MCP working directory.'),
            pagePath: z.string().optional().describe('Project-relative Markdown path to open, such as book/01-foundations.md.')
        },
        outputSchema: {
            url: z.string(),
            rootPath: z.string().optional(),
            pagePath: z.string().optional()
        },
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            openWorldHint: false
        },
    }, async ({ projectRoot, pagePath }) => {
        try {
            const launch = await registry.open(projectRoot, pagePath);
            const target = launch.pagePath ? ` for ${launch.pagePath}` : '';
            return {
                content: [{
                    type: 'text',
                    text: `Math Workspace is ready${target}. Open it in Codex's local browser or any browser: ${launch.url}`
                }],
                structuredContent: launch
            };
        } catch (error) {
            return {
                content: [{
                    type: 'text',
                    text: error instanceof Error ? error.message : String(error)
                }],
                isError: true
            };
        }
    });

    const transport = new StdioServerTransport();
    let closing = false;
    const close = async () => {
        if (closing) return;
        closing = true;
        await registry.close();
        await server.close();
    };
    const shutdown = () => {
        void close().finally(() => process.exit(0));
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
    await server.connect(transport);
}
