import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { normalizeLatexSymbol } from '@math-workspace/core';
import { mathWorkspaceStatePath } from './local-state';

const nodeFs = require('node:fs');

export const SYMBOL_AUDIT_PROMPT_VERSION = 'symbol-audit-v1';
const MAX_EXTRACTION_CACHE_ENTRIES = 640;
const MAX_REPORT_CACHE_ENTRIES = 160;

export type SymbolAuditBindingKind = 'special' | 'temporary';

export interface SymbolAuditSettings {
    /** Undefined means follow the current Codex default. */
    model?: string;
    /** Undefined means use the selected model's default effort. */
    effort?: string;
}

export interface SymbolAuditSource {
    filePath: string;
    content: string;
    registeredSymbols: Array<{
        pattern: string;
        display: string;
        meaning: string;
        scope: string;
        sourceLine?: number;
    }>;
}

export interface SymbolAuditBinding {
    id: string;
    filePath: string;
    startLine: number;
    endLine: number;
    expression: string;
    normalizedExpression: string;
    structure: {
        base: string;
        modifiers: string[];
    };
    kind: SymbolAuditBindingKind;
    scope: 'book' | 'chapter' | 'section' | 'local';
    /** A short stable semantic identity used for mechanical comparison. */
    bindingKey: string;
    semanticType: string;
    meaning: string;
    evidence: string;
    confidence: 'high' | 'medium' | 'low';
}

export interface SymbolAuditExtraction {
    cacheKey: string;
    filePath: string;
    sourceHash: string;
    promptVersion: string;
    model?: string;
    effort?: string;
    extractedAt: string;
    bindings: SymbolAuditBinding[];
}

export interface SymbolAuditConflict {
    expression: string;
    severity: 'hard';
    reason: string;
    bindings: SymbolAuditBinding[];
}

export interface SymbolAuditCandidate {
    expression: string;
    bindings: SymbolAuditBinding[];
}

export interface SymbolAuditAdvisory {
    expression: string;
    severity: 'notice' | 'review';
    reason: string;
    bindingKeys: string[];
}

export interface SymbolAuditReport {
    cacheKey: string;
    createdAt: string;
    inputHash: string;
    promptVersion: string;
    model?: string;
    effort?: string;
    bindingCount: number;
    scannedFiles: number;
    reusedFiles: number;
    hardConflicts: SymbolAuditConflict[];
    candidates: SymbolAuditCandidate[];
    advisories: SymbolAuditAdvisory[];
}

export interface SymbolAuditAnalysis {
    hardConflicts: SymbolAuditConflict[];
    candidates: SymbolAuditCandidate[];
}

interface SymbolAuditProjectState {
    settings: SymbolAuditSettings;
    extractions: Record<string, SymbolAuditExtraction>;
    reports: Record<string, SymbolAuditReport>;
    latestReportKey?: string;
}

interface SymbolAuditStateFile {
    version: 1;
    projects: Record<string, SymbolAuditProjectState>;
}

export interface SymbolAuditStoreOptions {
    stateFilePath?: string;
}

function emptyProjectState(): SymbolAuditProjectState {
    return { settings: {}, extractions: {}, reports: {} };
}

function emptyState(): SymbolAuditStateFile {
    return { version: 1, projects: {} };
}

function stringValue(value: unknown, maximum = 300): string {
    return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
    return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? value as T : fallback;
}

function positiveLine(value: unknown, fallback: number): number {
    return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

function normalizedBindingKey(value: string): string {
    return value.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 96);
}

export function sha256(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
}

export function symbolAuditExtractionCacheKey(
    filePath: string,
    sourceHash: string,
    settings: SymbolAuditSettings
): string {
    return sha256(JSON.stringify({
        filePath,
        sourceHash,
        promptVersion: SYMBOL_AUDIT_PROMPT_VERSION,
        model: settings.model || '',
        effort: settings.effort || ''
    }));
}

export function symbolAuditReportCacheKey(
    sources: Array<Pick<SymbolAuditExtraction, 'cacheKey' | 'filePath'>>,
    settings: SymbolAuditSettings
): string {
    return sha256(JSON.stringify({
        sources: sources.map(source => [source.filePath, source.cacheKey]).sort((left, right) => left[0].localeCompare(right[0])),
        promptVersion: SYMBOL_AUDIT_PROMPT_VERSION,
        model: settings.model || '',
        effort: settings.effort || ''
    }));
}

/**
 * Treat model output as untrusted. This preserves a small, stable local data
 * contract even when a model adds prose or uses a non-canonical shape.
 */
export function normalizeSymbolAuditBindings(
    rawBindings: unknown,
    source: Pick<SymbolAuditSource, 'filePath' | 'content'>
): SymbolAuditBinding[] {
    const raw = Array.isArray(rawBindings) ? rawBindings : [];
    const lineCount = Math.max(1, source.content.split(/\r?\n/).length);
    const seen = new Set<string>();
    const bindings: SymbolAuditBinding[] = [];

    raw.forEach((item, index) => {
        if (!item || typeof item !== 'object') return;
        const value = item as Record<string, unknown>;
        const expression = stringValue(value.expression, 160).replace(/^\$+|\$+$/g, '');
        const normalizedExpression = expression ? normalizeLatexSymbol(expression) : '';
        const meaning = stringValue(value.meaning, 480);
        const bindingKey = normalizedBindingKey(stringValue(value.bindingKey, 120));
        const semanticType = normalizedBindingKey(stringValue(value.semanticType, 80));
        if (!expression || !normalizedExpression || !meaning || !bindingKey || !semanticType) return;

        const startLine = Math.min(lineCount, positiveLine(value.startLine, 1));
        const endLine = Math.max(startLine, Math.min(lineCount, positiveLine(value.endLine, startLine)));
        const structureValue = value.structure && typeof value.structure === 'object' ? value.structure as Record<string, unknown> : {};
        const base = stringValue(structureValue.base, 80) || expression;
        const modifiers = Array.isArray(structureValue.modifiers)
            ? structureValue.modifiers.map(item => stringValue(item, 80)).filter(Boolean).slice(0, 8)
            : [];
        const kind = enumValue(value.kind, ['special', 'temporary'] as const, 'temporary');
        const scope = enumValue(value.scope, ['book', 'chapter', 'section', 'local'] as const, kind === 'special' ? 'book' : 'local');
        const identity = [source.filePath, startLine, endLine, normalizedExpression, bindingKey, kind].join(':');
        if (seen.has(identity)) return;
        seen.add(identity);
        bindings.push({
            id: 'mwsym_' + sha256(identity).slice(0, 16),
            filePath: source.filePath,
            startLine,
            endLine,
            expression,
            normalizedExpression,
            structure: { base, modifiers },
            kind,
            scope,
            bindingKey,
            semanticType,
            meaning,
            evidence: stringValue(value.evidence, 420),
            confidence: enumValue(value.confidence, ['high', 'medium', 'low'] as const, 'medium')
        });
    });

    return bindings.sort((left, right) => (
        left.filePath.localeCompare(right.filePath)
        || left.startLine - right.startLine
        || left.normalizedExpression.localeCompare(right.normalizedExpression)
        || left.bindingKey.localeCompare(right.bindingKey)
    ));
}

function uniqueBindings(bindings: SymbolAuditBinding[]): SymbolAuditBinding[] {
    return Array.from(new Map(bindings.map(binding => [binding.id, binding] as const)).values());
}

function bindingSummary(binding: SymbolAuditBinding): string {
    return `${binding.filePath}:${binding.startLine} assigns ${binding.expression} to ${binding.bindingKey} (${binding.semanticType}).`;
}

/**
 * Deterministic part of the audit. It deliberately only compares the model's
 * canonical binding keys; it never pretends that surface equality alone proves
 * a mathematical conflict.
 */
export function analyzeSymbolAuditBindings(bindings: SymbolAuditBinding[]): SymbolAuditAnalysis {
    const byExpression = new Map<string, SymbolAuditBinding[]>();
    bindings.forEach(binding => {
        const group = byExpression.get(binding.normalizedExpression) || [];
        group.push(binding);
        byExpression.set(binding.normalizedExpression, group);
    });

    const hardConflicts: SymbolAuditConflict[] = [];
    const candidates: SymbolAuditCandidate[] = [];
    byExpression.forEach(group => {
        const unique = uniqueBindings(group);
        const byBindingKey = new Map<string, SymbolAuditBinding[]>();
        unique.forEach(binding => {
            const sameMeaning = byBindingKey.get(binding.bindingKey) || [];
            sameMeaning.push(binding);
            byBindingKey.set(binding.bindingKey, sameMeaning);
        });
        if (byBindingKey.size < 2) return;
        const hasSpecial = unique.some(binding => binding.kind === 'special');
        const expression = unique[0].expression;
        if (hasSpecial) {
            hardConflicts.push({
                expression,
                severity: 'hard',
                reason: 'A declared special symbol and another distinct binding share the same notation.',
                bindings: unique
            });
            return;
        }
        candidates.push({ expression, bindings: unique });
    });

    const order = <T extends { expression: string }>(items: T[]): T[] => items.sort((left, right) => left.expression.localeCompare(right.expression));
    return { hardConflicts: order(hardConflicts), candidates: order(candidates) };
}

export function symbolAuditInputHash(extractions: SymbolAuditExtraction[]): string {
    return sha256(JSON.stringify(extractions.map(extraction => ({
        filePath: extraction.filePath,
        cacheKey: extraction.cacheKey,
        bindings: extraction.bindings.map(binding => [binding.id, binding.bindingKey, binding.normalizedExpression])
    })).sort((left, right) => left.filePath.localeCompare(right.filePath))));
}

function validSettings(value: unknown): SymbolAuditSettings {
    const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    const model = stringValue(record.model, 160);
    const effort = stringValue(record.effort, 80);
    return { ...(model ? { model } : {}), ...(effort ? { effort } : {}) };
}

function validBinding(value: unknown): value is SymbolAuditBinding {
    const binding = value as Partial<SymbolAuditBinding> | undefined;
    return !!binding
        && typeof binding.id === 'string'
        && typeof binding.filePath === 'string'
        && Number.isInteger(binding.startLine)
        && Number.isInteger(binding.endLine)
        && typeof binding.expression === 'string'
        && typeof binding.normalizedExpression === 'string'
        && typeof binding.bindingKey === 'string'
        && typeof binding.semanticType === 'string'
        && typeof binding.meaning === 'string'
        && (binding.kind === 'special' || binding.kind === 'temporary');
}

function validExtraction(value: unknown): value is SymbolAuditExtraction {
    const extraction = value as Partial<SymbolAuditExtraction> | undefined;
    return !!extraction
        && typeof extraction.cacheKey === 'string'
        && typeof extraction.filePath === 'string'
        && typeof extraction.sourceHash === 'string'
        && typeof extraction.promptVersion === 'string'
        && typeof extraction.extractedAt === 'string'
        && Array.isArray(extraction.bindings)
        && extraction.bindings.every(validBinding);
}

function validProjectState(value: unknown): SymbolAuditProjectState {
    const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    const extractions = Object.fromEntries(Object.entries(record.extractions || {}).filter(([, extraction]) => validExtraction(extraction))) as Record<string, SymbolAuditExtraction>;
    const reports = record.reports && typeof record.reports === 'object' ? record.reports as Record<string, SymbolAuditReport> : {};
    return {
        settings: validSettings(record.settings),
        extractions,
        reports,
        ...(typeof record.latestReportKey === 'string' ? { latestReportKey: record.latestReportKey } : {})
    };
}

function pruneByDate<T extends { createdAt?: string; extractedAt?: string }>(entries: Record<string, T>, maximum: number): Record<string, T> {
    const ordered = Object.entries(entries).sort((left, right) => (
        String(right[1].createdAt || right[1].extractedAt || '').localeCompare(String(left[1].createdAt || left[1].extractedAt || ''))
    ));
    return Object.fromEntries(ordered.slice(0, maximum));
}

/** Local-only state for explicit audit settings and cache entries. */
export class SymbolAuditStore {
    private readonly stateFilePath: string;
    private sequence: Promise<void> = Promise.resolve();

    constructor(options: SymbolAuditStoreOptions = {}) {
        this.stateFilePath = options.stateFilePath || process.env.MATH_WORKSPACE_SYMBOL_AUDIT_STATE || mathWorkspaceStatePath('symbol-audit.json');
    }

    async project(rootPath: string): Promise<SymbolAuditProjectState> {
        await this.sequence;
        const state = await this.read();
        return validProjectState(state.projects[rootPath]);
    }

    async updateSettings(rootPath: string, settings: SymbolAuditSettings): Promise<SymbolAuditSettings> {
        return this.mutate(rootPath, project => {
            project.settings = validSettings(settings);
            return project.settings;
        });
    }

    async saveExtraction(rootPath: string, extraction: SymbolAuditExtraction): Promise<void> {
        await this.mutate(rootPath, project => {
            project.extractions[extraction.cacheKey] = extraction;
            project.extractions = pruneByDate(project.extractions, MAX_EXTRACTION_CACHE_ENTRIES);
        });
    }

    async saveReport(rootPath: string, report: SymbolAuditReport): Promise<void> {
        await this.mutate(rootPath, project => {
            project.reports[report.cacheKey] = report;
            project.reports = pruneByDate(project.reports, MAX_REPORT_CACHE_ENTRIES);
            project.latestReportKey = report.cacheKey;
        });
    }

    private async mutate<T>(rootPath: string, operation: (project: SymbolAuditProjectState) => T): Promise<T> {
        let resolveResult: (value: T | PromiseLike<T>) => void;
        let rejectResult: (reason?: unknown) => void;
        const result = new Promise<T>((resolve, reject) => {
            resolveResult = resolve;
            rejectResult = reject;
        });
        this.sequence = this.sequence.then(async () => {
            try {
                const state = await this.read();
                const project = validProjectState(state.projects[rootPath]);
                const value = operation(project);
                state.projects[rootPath] = project;
                await this.write(state);
                resolveResult(value);
            } catch (error) {
                rejectResult(error);
            }
        });
        await this.sequence;
        return result;
    }

    private async read(): Promise<SymbolAuditStateFile> {
        try {
            const parsed = JSON.parse(await fs.readFile(this.stateFilePath, 'utf8')) as Partial<SymbolAuditStateFile>;
            const projects = parsed?.projects && typeof parsed.projects === 'object'
                ? Object.fromEntries(Object.entries(parsed.projects).map(([rootPath, project]) => [rootPath, validProjectState(project)]))
                : {};
            return { version: 1, projects };
        } catch (error: any) {
            if (error?.code === 'ENOENT') return emptyState();
            return emptyState();
        }
    }

    private async write(state: SymbolAuditStateFile): Promise<void> {
        await fs.mkdir(path.dirname(this.stateFilePath), { recursive: true });
        const temporaryPath = `${this.stateFilePath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
        try {
            await fs.writeFile(temporaryPath, JSON.stringify(state, null, 2) + '\n', 'utf8');
            await nodeFs.promises.rename(temporaryPath, this.stateFilePath);
        } catch (error) {
            await nodeFs.promises.unlink(temporaryPath).catch(() => undefined);
            throw error;
        }
    }
}

export function createSymbolAuditExtraction(
    source: Pick<SymbolAuditSource, 'filePath' | 'content'>,
    settings: SymbolAuditSettings,
    rawBindings: unknown
): SymbolAuditExtraction {
    const sourceHash = sha256(source.content);
    return {
        cacheKey: symbolAuditExtractionCacheKey(source.filePath, sourceHash, settings),
        filePath: source.filePath,
        sourceHash,
        promptVersion: SYMBOL_AUDIT_PROMPT_VERSION,
        ...(settings.model ? { model: settings.model } : {}),
        ...(settings.effort ? { effort: settings.effort } : {}),
        extractedAt: new Date().toISOString(),
        bindings: normalizeSymbolAuditBindings(rawBindings, source)
    };
}

export function createSymbolAuditReport(
    extractions: SymbolAuditExtraction[],
    settings: SymbolAuditSettings,
    scannedFiles: number,
    reusedFiles: number,
    advisories: SymbolAuditAdvisory[] = []
): SymbolAuditReport {
    const bindings = extractions.flatMap(extraction => extraction.bindings);
    const analysis = analyzeSymbolAuditBindings(bindings);
    return {
        cacheKey: symbolAuditReportCacheKey(extractions, settings),
        createdAt: new Date().toISOString(),
        inputHash: symbolAuditInputHash(extractions),
        promptVersion: SYMBOL_AUDIT_PROMPT_VERSION,
        ...(settings.model ? { model: settings.model } : {}),
        ...(settings.effort ? { effort: settings.effort } : {}),
        bindingCount: bindings.length,
        scannedFiles,
        reusedFiles,
        hardConflicts: analysis.hardConflicts,
        candidates: analysis.candidates,
        advisories
    };
}

export function bindingSummaryForPrompt(binding: SymbolAuditBinding): string {
    return bindingSummary(binding);
}
