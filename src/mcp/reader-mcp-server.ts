import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { startReaderServer, type FormalReaderServer } from '../reader/server';
import { WorkspaceQueries } from './workspace-queries';

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
    const queries = new WorkspaceQueries({ rootPath: options.rootPath });
    const server = new McpServer({
        name: 'math-workspace',
        version: '0.1.0'
    }, {
        instructions: 'Use Math Workspace for local, read-only formal Markdown and Lean context. When a user supplies an mwsel_ selection handoff, call math_workspace_selection_get first. Use the narrow lookup, dependency, Lean, and validation tools instead of asking the user to paste project context.'
    });

    const projectRoot = z.string().optional().describe('Absolute or relative root of a project containing .math-workspace/config.json. Defaults to the MCP working directory.');
    const query = async (work: () => Promise<Record<string, unknown>>, success: string) => {
        try {
            const result = await work();
            return {
                content: [{
                    type: 'text' as const,
                    text: `${success}\n\n${JSON.stringify(result, null, 2)}`
                }],
                structuredContent: { result }
            };
        } catch (error) {
            return { content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }], isError: true };
        }
    };

    server.registerTool('math_workspace_selection_get', {
        title: 'Read a Math Workspace selection handoff',
        description: 'Resolve a short-lived mwsel_ selection created in Math Workspace. It validates that the source has not changed and returns only the selected source context.',
        inputSchema: {
            selectionId: z.string().describe('The mwsel_ selection id pasted from Math Workspace.'),
            projectRoot
        },
        outputSchema: { result: z.object({}).passthrough() },
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
    }, ({ selectionId, projectRoot: root }) => query(() => queries.selectionGet(selectionId, root), `Math Workspace selection ${selectionId} is current.`));

    server.registerTool('math_workspace_formal_lookup', {
        title: 'Look up a formal Markdown object',
        description: 'Return one formal object’s stable location, source excerpt, and Lean-anchor summary by h- id.',
        inputSchema: { id: z.string().describe('An h- id, with or without @ or #.'), projectRoot },
        outputSchema: { result: z.object({}).passthrough() },
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
    }, ({ id, projectRoot: root }) => query(() => queries.formalLookup(id, root), `Math Workspace formal object ${id} loaded.`));

    server.registerTool('math_workspace_dependency_slice', {
        title: 'Inspect strict formal dependencies',
        description: 'Return a bounded, strict-only upstream and/or downstream dependency slice for one formal object.',
        inputSchema: {
            id: z.string().describe('An h- id, with or without @ or #.'),
            direction: z.enum(['upstream', 'downstream', 'both']).optional().describe('Defaults to both.'),
            depth: z.number().int().min(1).max(4).optional().describe('Graph hops, from 1 to 4. Defaults to 1.'),
            projectRoot
        },
        outputSchema: { result: z.object({}).passthrough() },
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
    }, ({ id, direction, depth, projectRoot: root }) => query(() => queries.dependencySlice(id, direction, depth, root), `Math Workspace dependency slice for ${id} loaded.`));

    server.registerTool('math_workspace_lean_alignment', {
        title: 'Inspect Lean alignment',
        description: 'Return observed Lean anchors, declaration status, build evidence, and dependency comparison for one formal object.',
        inputSchema: { id: z.string().describe('An h- id, with or without @ or #.'), projectRoot },
        outputSchema: { result: z.object({}).passthrough() },
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
    }, ({ id, projectRoot: root }) => query(() => queries.leanAlignment(id, root), `Math Workspace Lean alignment for ${id} loaded.`));

    server.registerTool('math_workspace_verify', {
        title: 'Run a read-only Math Workspace validation scan',
        description: 'Scan formal Markdown and Lean alignment in memory. It does not generate artifacts, run Lean builds, or modify source files.',
        inputSchema: { strictChapters: z.boolean().optional().describe('Treat chapter-gap warnings as blocking.'), projectRoot },
        outputSchema: { result: z.object({}).passthrough() },
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
    }, ({ strictChapters, projectRoot: root }) => query(() => queries.verify(strictChapters, root), 'Math Workspace read-only validation completed.'));

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
