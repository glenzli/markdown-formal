import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { formatDisplayNumber, type LabelData, type PageData } from '@math-workspace/core';
import { readLeanBuild } from '../lean/lean-state';
import { readLeanDependencyArtifact } from '../lean/lean-dependencies';
import { ReaderDiscussionMarkStore } from '../reader/discussion-marks';
import { loadWorkspaceSnapshot, type WorkspaceSnapshot } from '../reader/workspace';

const nodeFs = require('node:fs');

const VERIFY_BLOCKING_WARNING_CODES = new Set([
    'non-hash-id',
    'formal-marker-outside-numbered-file',
    'duplicate-special-page',
    'definition-content-missing',
    'definition-content-stale'
]);
const MAX_SOURCE_CHARS = 14_000;
const MAX_GRAPH_NODES = 72;

export interface WorkspaceQueryOptions {
    rootPath?: string;
    discussionMarksPath?: string;
}

function normalizeFormalId(value: string): string {
    return value.trim().replace(/^[@#]/, '');
}

function excerpt(value: string | undefined): { value: string; truncated: boolean } {
    const source = String(value || '');
    return source.length <= MAX_SOURCE_CHARS
        ? { value: source, truncated: false }
        : { value: `${source.slice(0, MAX_SOURCE_CHARS)}\n\n… [truncated by Math Workspace]`, truncated: true };
}

function sourceHash(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function display(label: LabelData): string {
    const number = formatDisplayNumber(label);
    return number ? `${label.type} ${number}` : label.type;
}

function pageFor(snapshot: WorkspaceSnapshot, filePath: string): PageData | undefined {
    return (snapshot.state.pages || []).find((page: PageData) => page.filePath === filePath);
}

function nodeSummary(snapshot: WorkspaceSnapshot, id: string): Record<string, unknown> {
    const graphNode = (snapshot.state.dependencyGraph?.nodes || []).find((node: any) => node.id === id);
    const label = snapshot.state.labels?.[id] as LabelData | undefined;
    if (graphNode) return {
        id,
        display: graphNode.display,
        type: graphNode.kind,
        title: graphNode.title,
        filePath: graphNode.path,
        line: graphNode.line
    };
    if (label) return {
        id,
        display: display(label),
        type: label.type,
        title: label.title,
        filePath: label.filePath,
        line: (label.startLine || 0) + 1
    };
    return { id };
}

export class WorkspaceQueries {
    private readonly discussionMarks: ReaderDiscussionMarkStore;

    constructor(private readonly options: WorkspaceQueryOptions = {}) {
        this.discussionMarks = new ReaderDiscussionMarkStore({ stateFilePath: options.discussionMarksPath });
    }

    async discussionMarksGet(projectRoot?: string): Promise<Record<string, unknown>> {
        const rootPath = await this.resolveRoot(projectRoot);
        const snapshot = await loadWorkspaceSnapshot(rootPath);
        const marks = await this.discussionMarks.list(rootPath);
        return {
            project: { rootPath, rootName: path.basename(rootPath), revision: snapshot.revision },
            marks: marks.map(mark => {
                const source = snapshot.documents.get(mark.filePath);
                const currentLines = source?.split(/\r?\n/).slice(mark.startLine - 1, mark.endLine).join('\n');
                return {
                    id: mark.id,
                    order: mark.order,
                    createdAt: mark.createdAt,
                    kind: mark.kind,
                    filePath: mark.filePath,
                    title: mark.title,
                    startLine: mark.startLine,
                    endLine: mark.endLine,
                    ...(mark.formalId ? { formalId: mark.formalId } : {}),
                    ...(mark.formulaId ? { formulaId: mark.formulaId } : {}),
                    ...(Number.isInteger(mark.startTextOffset) ? { startTextOffset: mark.startTextOffset } : {}),
                    ...(Number.isInteger(mark.endTextOffset) ? { endTextOffset: mark.endTextOffset } : {}),
                    status: currentLines && sourceHash(currentLines) === mark.sourceHash ? 'current' : 'changed'
                };
            }),
            guidance: marks.length
                ? 'Read the listed Markdown ranges from the local project before answering. Do not treat this locator response as source content.'
                : 'No discussion marks are active for this project.'
        };
    }

    async formalLookup(idInput: string, projectRoot?: string): Promise<Record<string, unknown>> {
        const rootPath = await this.resolveRoot(projectRoot);
        const snapshot = await loadWorkspaceSnapshot(rootPath);
        const id = normalizeFormalId(idInput);
        const label = snapshot.state.labels?.[id] as LabelData | undefined;
        if (!label) throw new Error(`No formal object with id ${idInput} exists in this Math Workspace project.`);
        const content = excerpt(label.content);
        const page = pageFor(snapshot, label.filePath);
        return {
            id,
            display: display(label),
            type: label.type,
            title: label.title,
            filePath: label.filePath,
            line: (label.startLine || 0) + 1,
            endLine: label.endLine,
            pageTitle: page?.title,
            content: content.value,
            truncated: content.truncated,
            leanAnchor: snapshot.state.leanIndex?.anchors?.[id] ? {
                declarations: snapshot.state.leanIndex.anchors[id].declarations?.length || 0,
                status: snapshot.state.leanIndex.anchors[id].status
            } : undefined
        };
    }

    async dependencySlice(idInput: string, direction: 'upstream' | 'downstream' | 'both' = 'both', depth = 1, projectRoot?: string): Promise<Record<string, unknown>> {
        const rootPath = await this.resolveRoot(projectRoot);
        const snapshot = await loadWorkspaceSnapshot(rootPath);
        const id = normalizeFormalId(idInput);
        const graph = snapshot.state.dependencyGraph || {};
        const nodes = new Map<string, any>((graph.nodes || []).map((node: any) => [node.id, node]));
        if (!nodes.has(id)) throw new Error(`No dependency-graph node with id ${idInput} exists in this project.`);
        const boundedDepth = Math.max(1, Math.min(4, Number.isInteger(depth) ? depth : 1));
        const edges = (graph.edges || []).filter((edge: any) => edge.relation === 'strict');
        const selectedIds = new Set<string>([id]);
        const selectedEdges = new Map<string, any>();

        const walk = (mode: 'upstream' | 'downstream') => {
            let frontier = new Set<string>([id]);
            for (let level = 0; level < boundedDepth && frontier.size > 0 && selectedIds.size < MAX_GRAPH_NODES; level++) {
                const next = new Set<string>();
                for (const current of frontier) {
                    const matches = edges.filter((edge: any) => mode === 'upstream' ? edge.from === current : edge.to === current);
                    for (const edge of matches) {
                        const target = mode === 'upstream' ? edge.to : edge.from;
                        selectedEdges.set(`${edge.from}:${edge.to}:${edge.path}:${edge.line}:${edge.where}`, edge);
                        if (!selectedIds.has(target) && selectedIds.size < MAX_GRAPH_NODES) {
                            selectedIds.add(target);
                            next.add(target);
                        }
                    }
                }
                frontier = next;
            }
        };
        if (direction === 'upstream' || direction === 'both') walk('upstream');
        if (direction === 'downstream' || direction === 'both') walk('downstream');
        return {
            id,
            direction,
            depth: boundedDepth,
            strictOnly: true,
            truncated: selectedIds.size >= MAX_GRAPH_NODES,
            nodes: Array.from(selectedIds).map(candidate => nodeSummary(snapshot, candidate)),
            edges: Array.from(selectedEdges.values()).map((edge: any) => ({
                from: edge.from,
                to: edge.to,
                where: edge.where,
                filePath: edge.path,
                line: edge.line
            }))
        };
    }

    async leanAlignment(idInput: string, projectRoot?: string): Promise<Record<string, unknown>> {
        const rootPath = await this.resolveRoot(projectRoot);
        const snapshot = await loadWorkspaceSnapshot(rootPath);
        const id = normalizeFormalId(idInput);
        const anchor = snapshot.state.leanIndex?.anchors?.[id];
        if (!anchor) return { id, anchored: false, formal: nodeSummary(snapshot, id) };
        const projectKeys = [...new Set<string>((anchor.declarations || []).map((item: any) => item.projectKey).filter(Boolean))];
        const [build, dependencies] = await Promise.all([readLeanBuild(rootPath), readLeanDependencyArtifact(rootPath)]);
        const builds = Object.fromEntries(projectKeys.map(key => [key, build?.projects?.[key]]).filter(([, value]) => !!value));
        return {
            id,
            anchored: true,
            formal: anchor.formal,
            declarations: anchor.declarations,
            status: anchor.status,
            ...(Object.keys(builds).length ? { builds } : {}),
            ...(dependencies?.comparisons?.[id] ? { dependencyComparison: dependencies.comparisons[id] } : {})
        };
    }

    async verify(strictChapters = false, projectRoot?: string): Promise<Record<string, unknown>> {
        const rootPath = await this.resolveRoot(projectRoot);
        const snapshot = await loadWorkspaceSnapshot(rootPath);
        const allIssues = snapshot.state.issues || [];
        const blockingIssues = allIssues.filter((issue: any) => issue.severity === 'error'
            || VERIFY_BLOCKING_WARNING_CODES.has(issue.code)
            || (strictChapters && issue.code === 'chapter-gap'));
        return {
            readOnly: true,
            strictChapters,
            ok: blockingIssues.length === 0,
            summary: {
                errors: allIssues.filter((issue: any) => issue.severity === 'error').length,
                warnings: allIssues.filter((issue: any) => issue.severity === 'warn').length,
                blocking: blockingIssues.length,
                lean: snapshot.state.leanIndex?.summary || {}
            },
            blockingIssues: blockingIssues.slice(0, 80),
            ...(blockingIssues.length > 80 ? { truncated: true } : {})
        };
    }

    private async resolveRoot(projectRoot?: string): Promise<string> {
        const rootPath = path.resolve(projectRoot || this.options.rootPath || process.cwd());
        try {
            if ((await fs.stat(path.join(rootPath, '.math-workspace', 'config.json'))).isFile()) return await nodeFs.promises.realpath(rootPath);
        } catch (_error) {
            // The common error below is clearer than a platform-specific stat error.
        }
        throw new Error('The Math Workspace project needs .math-workspace/config.json. Run `math-workspace prepare` first.');
    }
}
