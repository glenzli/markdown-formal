import type { WorkspaceSnapshot } from './workspace';
import { CodexSymbolAuditRunner, type CodexSymbolAuditModel } from './codex-symbol-audit';
import {
    createSymbolAuditExtraction,
    createSymbolAuditReport,
    sha256,
    symbolAuditExtractionCacheKey,
    symbolAuditReportCacheKey,
    SymbolAuditStore,
    type SymbolAuditExtraction,
    type SymbolAuditReport,
    type SymbolAuditSettings,
    type SymbolAuditSource
} from './symbol-audit';

export interface SymbolAuditJobStatus {
    id: string;
    status: 'running' | 'complete' | 'failed' | 'cancelled';
    startedAt: string;
    completedAt?: string;
    totalFiles: number;
    completedFiles: number;
    scannedFiles: number;
    reusedFiles: number;
    currentFilePath?: string;
    error?: string;
}

export interface SymbolAuditStatus {
    settings: SymbolAuditSettings;
    cache: {
        totalFiles: number;
        reusableFiles: number;
        missingFiles: number;
    };
    reportState: 'none' | 'current' | 'stale';
    report?: SymbolAuditReport;
    job?: SymbolAuditJobStatus;
}

interface ActiveJob extends SymbolAuditJobStatus {
    rootPath: string;
    settings: SymbolAuditSettings;
    cancelled: boolean;
}

function cleanError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error || 'Unknown audit error.');
    return message.replace(/\s+/g, ' ').trim().slice(0, 720);
}

function sourceForFile(snapshot: WorkspaceSnapshot, filePath: string, content: string): SymbolAuditSource {
    const registeredSymbols = (snapshot.state.symbols || [])
        .filter((symbol: any) => symbol?.sourceFilePath === filePath)
        .map((symbol: any) => ({
            pattern: String(symbol.pattern || ''),
            display: String(symbol.display || ''),
            meaning: String(symbol.meaning || ''),
            scope: String(symbol.scope || 'book'),
            ...(Number.isInteger(symbol.sourceLine) ? { sourceLine: symbol.sourceLine } : {})
        }));
    return { filePath, content, registeredSymbols };
}

function sourcesForSnapshot(snapshot: WorkspaceSnapshot): SymbolAuditSource[] {
    return Array.from(snapshot.documents.entries())
        .filter(([filePath]) => filePath.toLowerCase().endsWith('.md'))
        .map(([filePath, content]) => sourceForFile(snapshot, filePath, content));
}

function currentReportKey(sources: SymbolAuditSource[], settings: SymbolAuditSettings): string {
    return symbolAuditReportCacheKey(sources.map(source => ({
        filePath: source.filePath,
        cacheKey: symbolAuditExtractionCacheKey(source.filePath, sha256(source.content), settings)
    })), settings);
}

/**
 * Owns an explicit, one-project-at-a-time audit job. Workspace refreshes only
 * change the cache eligibility reported to the user; they never start a model
 * turn on their own.
 */
export class SymbolAuditService {
    private readonly store: SymbolAuditStore;
    private readonly runner: CodexSymbolAuditRunner;
    private active: ActiveJob | undefined;
    private lastJob: ActiveJob | undefined;

    constructor(options: { store?: SymbolAuditStore; runner?: CodexSymbolAuditRunner } = {}) {
        this.store = options.store || new SymbolAuditStore();
        this.runner = options.runner || new CodexSymbolAuditRunner();
    }

    async status(rootPath: string, snapshot: WorkspaceSnapshot): Promise<SymbolAuditStatus> {
        const project = await this.store.project(rootPath);
        const sources = sourcesForSnapshot(snapshot);
        const reusableFiles = sources.filter(source => (
            !!project.extractions[symbolAuditExtractionCacheKey(source.filePath, sha256(source.content), project.settings)]
        )).length;
        const key = currentReportKey(sources, project.settings);
        const report = project.reports[key] || (project.latestReportKey ? project.reports[project.latestReportKey] : undefined);
        const reportState: SymbolAuditStatus['reportState'] = !report
            ? 'none'
            : project.reports[key] ? 'current' : 'stale';
        const job = this.active?.rootPath === rootPath ? this.active : this.lastJob?.rootPath === rootPath ? this.lastJob : undefined;
        return {
            settings: project.settings,
            cache: {
                totalFiles: sources.length,
                reusableFiles,
                missingFiles: sources.length - reusableFiles
            },
            reportState,
            ...(report ? { report } : {}),
            ...(job ? { job: this.publicJob(job) } : {})
        };
    }

    async updateSettings(rootPath: string, settings: SymbolAuditSettings): Promise<SymbolAuditSettings> {
        if (this.active?.rootPath === rootPath) throw new Error('Wait for the active symbol audit before changing its model settings.');
        return this.store.updateSettings(rootPath, settings);
    }

    async models(): Promise<CodexSymbolAuditModel[]> {
        return this.runner.listModels();
    }

    async start(rootPath: string, snapshot: WorkspaceSnapshot, force = false): Promise<SymbolAuditJobStatus> {
        if (this.active) throw new Error('A symbol audit is already in progress.');
        const project = await this.store.project(rootPath);
        const sources = sourcesForSnapshot(snapshot);
        const job: ActiveJob = {
            id: 'mwaudit_' + sha256(`${rootPath}:${Date.now()}:${Math.random()}`).slice(0, 16),
            rootPath,
            settings: project.settings,
            status: 'running',
            startedAt: new Date().toISOString(),
            totalFiles: sources.length,
            completedFiles: 0,
            scannedFiles: 0,
            reusedFiles: 0,
            cancelled: false
        };
        this.active = job;
        this.lastJob = job;
        void this.run(job, sources, project.extractions, force);
        return this.publicJob(job);
    }

    async cancel(rootPath: string): Promise<SymbolAuditJobStatus | undefined> {
        const job = this.active;
        if (!job || job.rootPath !== rootPath) return undefined;
        job.cancelled = true;
        await this.runner.interrupt();
        return this.publicJob(job);
    }

    async close(): Promise<void> {
        await this.runner.close();
    }

    private async run(
        job: ActiveJob,
        sources: SymbolAuditSource[],
        cachedExtractions: Record<string, SymbolAuditExtraction>,
        force: boolean
    ): Promise<void> {
        try {
            const extractions: SymbolAuditExtraction[] = [];
            for (const source of sources) {
                if (job.cancelled) throw new Error('Symbol audit was cancelled.');
                job.currentFilePath = source.filePath;
                const sourceHash = sha256(source.content);
                const cacheKey = symbolAuditExtractionCacheKey(source.filePath, sourceHash, job.settings);
                const cached = !force ? cachedExtractions[cacheKey] : undefined;
                if (cached) {
                    extractions.push(cached);
                    job.reusedFiles++;
                    job.completedFiles++;
                    continue;
                }
                const rawBindings = await this.runner.extract(job.rootPath, source, job.settings);
                if (job.cancelled) throw new Error('Symbol audit was cancelled.');
                const extraction = createSymbolAuditExtraction(source, job.settings, rawBindings);
                await this.store.saveExtraction(job.rootPath, extraction);
                extractions.push(extraction);
                job.scannedFiles++;
                job.completedFiles++;
            }

            if (job.cancelled) throw new Error('Symbol audit was cancelled.');
            job.currentFilePath = undefined;
            const reportKey = symbolAuditReportCacheKey(extractions, job.settings);
            const project = await this.store.project(job.rootPath);
            const cachedReport = !force ? project.reports[reportKey] : undefined;
            if (!cachedReport) {
                const preliminary = createSymbolAuditReport(extractions, job.settings, job.scannedFiles, job.reusedFiles);
                const advisories = await this.runner.reviewTemporaryCandidates(job.rootPath, preliminary.candidates, job.settings);
                if (job.cancelled) throw new Error('Symbol audit was cancelled.');
                const report = createSymbolAuditReport(extractions, job.settings, job.scannedFiles, job.reusedFiles, advisories);
                await this.store.saveReport(job.rootPath, report);
            }
            job.status = 'complete';
            job.completedAt = new Date().toISOString();
        } catch (error) {
            job.status = job.cancelled ? 'cancelled' : 'failed';
            job.error = cleanError(error);
            job.completedAt = new Date().toISOString();
        } finally {
            job.currentFilePath = undefined;
            if (this.active === job) this.active = undefined;
        }
    }

    private publicJob(job: ActiveJob): SymbolAuditJobStatus {
        const { rootPath: _rootPath, settings: _settings, cancelled: _cancelled, ...status } = job;
        return status;
    }
}
