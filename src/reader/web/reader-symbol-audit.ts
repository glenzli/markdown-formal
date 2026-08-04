import { readerIcon } from './reader-icons';

export interface ReaderSymbolAuditBinding {
    filePath: string;
    startLine: number;
    expression: string;
    kind: 'special' | 'temporary';
    bindingKey: string;
    semanticType: string;
    meaning: string;
}

export interface ReaderSymbolAuditReport {
    createdAt: string;
    bindingCount: number;
    scannedFiles: number;
    reusedFiles: number;
    hardConflicts: Array<{ expression: string; reason: string; bindings: ReaderSymbolAuditBinding[] }>;
    candidates: Array<{ expression: string; bindings: ReaderSymbolAuditBinding[] }>;
    advisories: Array<{ expression: string; severity: 'notice' | 'review'; reason: string; bindingKeys: string[] }>;
}

export interface ReaderSymbolAuditStatus {
    settings: { model?: string; effort?: string };
    cache: { totalFiles: number; reusableFiles: number; missingFiles: number };
    reportState: 'none' | 'current' | 'stale';
    report?: ReaderSymbolAuditReport;
    job?: {
        status: 'running' | 'complete' | 'failed' | 'cancelled';
        totalFiles: number;
        completedFiles: number;
        scannedFiles: number;
        reusedFiles: number;
        currentFilePath?: string;
        error?: string;
    };
}

export interface ReaderSymbolAuditModel {
    model: string;
    displayName: string;
    description: string;
    isDefault: boolean;
    defaultReasoningEffort: string;
    supportedReasoningEfforts: Array<{ reasoningEffort: string; description: string }>;
}

export interface ReaderSymbolAuditLabels {
    intro: string;
    cache: (reusable: number, total: number, missing: number) => string;
    configuredModel: string;
    configuredEffort: string;
    codexDefault: string;
    model: string;
    effort: string;
    loadModels: string;
    saveSettings: string;
    start: string;
    force: string;
    cancel: string;
    running: (completed: number, total: number, filePath?: string) => string;
    complete: (scanned: number, reused: number) => string;
    failed: string;
    cancelled: string;
    reportCurrent: string;
    reportStale: string;
    noReport: string;
    hardConflicts: (count: number) => string;
    possibleConfusion: (count: number) => string;
    noHardConflicts: string;
    noAdvisories: string;
    locate: string;
    loading: string;
    modelLoadFailed: string;
    actionFailed: string;
}

export interface ReaderSymbolAuditHost {
    labels: () => ReaderSymbolAuditLabels;
    getStatus: () => Promise<ReaderSymbolAuditStatus>;
    loadModels: () => Promise<ReaderSymbolAuditModel[]>;
    saveSettings: (settings: { model?: string; effort?: string }) => Promise<ReaderSymbolAuditStatus>;
    start: (force: boolean) => Promise<ReaderSymbolAuditStatus>;
    cancel: () => Promise<ReaderSymbolAuditStatus>;
    locate: (filePath: string, line: number) => void;
    changed: () => void;
}

function text(value: string, className?: string): HTMLElement {
    const element = document.createElement('p');
    if (className) element.className = className;
    element.textContent = value;
    return element;
}

function option(value: string, label: string, selected = false): HTMLOptionElement {
    const element = document.createElement('option');
    element.value = value;
    element.textContent = label;
    element.selected = selected;
    return element;
}

/** A compact, explicitly-triggered UI for the local symbol-audit job. */
export class ReaderSymbolAudit {
    private container: HTMLElement | undefined;
    private host: ReaderSymbolAuditHost | undefined;
    private status: ReaderSymbolAuditStatus | undefined;
    private models: ReaderSymbolAuditModel[] = [];
    private pollTimer: number | undefined;
    private busy = false;

    render(container: HTMLElement, host: ReaderSymbolAuditHost): void {
        this.dispose();
        this.container = container;
        this.host = host;
        void this.refresh();
    }

    dispose(): void {
        if (this.pollTimer !== undefined) window.clearTimeout(this.pollTimer);
        this.pollTimer = undefined;
        this.container = undefined;
        this.host = undefined;
    }

    private async refresh(): Promise<void> {
        if (!this.host || !this.container?.isConnected) return;
        try {
            this.status = await this.host.getStatus();
            this.draw();
            if (this.status.job?.status === 'running') {
                this.pollTimer = window.setTimeout(() => void this.refresh(), 1100);
            }
        } catch (error) {
            this.draw(error instanceof Error ? error.message : String(error));
        }
    }

    private draw(error = ''): void {
        const container = this.container;
        const host = this.host;
        if (!container || !host) return;
        const labels = host.labels();
        container.replaceChildren();
        if (!this.status) {
            container.append(text(error || labels.loading, 'reader-panel-summary'));
            return;
        }

        container.append(text(labels.intro, 'reader-symbol-audit-intro'));
        container.append(text(labels.cache(
            this.status.cache.reusableFiles,
            this.status.cache.totalFiles,
            this.status.cache.missingFiles
        ), 'reader-symbol-audit-cache'));

        const settings = document.createElement('section');
        settings.className = 'reader-symbol-audit-settings';
        const settingsHeader = document.createElement('div');
        settingsHeader.className = 'reader-symbol-audit-settings-header';
        settingsHeader.append(text(labels.configuredModel + '：' + (this.status.settings.model || labels.codexDefault)), text(labels.configuredEffort + '：' + (this.status.settings.effort || labels.codexDefault)));
        const modelRow = document.createElement('label');
        modelRow.className = 'reader-symbol-audit-field';
        modelRow.append(document.createTextNode(labels.model));
        const model = document.createElement('select');
        model.className = 'reader-panel-search';
        model.append(option('', labels.codexDefault, !this.status.settings.model));
        const allModels = this.models.length ? this.models : this.status.settings.model ? [{
            model: this.status.settings.model,
            displayName: this.status.settings.model,
            description: '',
            isDefault: false,
            defaultReasoningEffort: this.status.settings.effort || '',
            supportedReasoningEfforts: this.status.settings.effort ? [{ reasoningEffort: this.status.settings.effort, description: '' }] : []
        }] : [];
        allModels.forEach(item => model.append(option(item.model, item.displayName + (item.isDefault ? ' · ' + labels.codexDefault : ''), item.model === this.status?.settings.model)));
        modelRow.append(model);
        const effortRow = document.createElement('label');
        effortRow.className = 'reader-symbol-audit-field';
        effortRow.append(document.createTextNode(labels.effort));
        const effort = document.createElement('select');
        effort.className = 'reader-panel-search';
        const populateEfforts = () => {
            const selectedModel = allModels.find(item => item.model === model.value);
            const current = effort.value || this.status?.settings.effort || '';
            effort.replaceChildren(option('', labels.codexDefault, !current));
            (selectedModel?.supportedReasoningEfforts || []).forEach(item => effort.append(option(item.reasoningEffort, item.reasoningEffort, item.reasoningEffort === current)));
            if (current && !Array.from(effort.options).some(item => item.value === current)) effort.append(option(current, current, true));
            if (!effort.value && selectedModel?.defaultReasoningEffort) effort.value = selectedModel.defaultReasoningEffort;
        };
        populateEfforts();
        model.addEventListener('change', populateEfforts);
        effortRow.append(effort);
        const settingActions = document.createElement('div');
        settingActions.className = 'reader-symbol-audit-actions';
        const loadModels = document.createElement('button');
        loadModels.type = 'button';
        loadModels.className = 'reader-panel-action';
        loadModels.append(readerIcon('reload'));
        loadModels.dataset.tooltip = labels.loadModels;
        loadModels.setAttribute('aria-label', labels.loadModels);
        loadModels.addEventListener('click', () => void this.loadModels());
        const save = document.createElement('button');
        save.type = 'button';
        save.className = 'reader-symbol-audit-button is-secondary';
        save.textContent = labels.saveSettings;
        save.addEventListener('click', () => void this.act(async () => {
            this.status = await host.saveSettings({
                ...(model.value ? { model: model.value } : {}),
                ...(effort.value ? { effort: effort.value } : {})
            });
        }));
        settingActions.append(loadModels, save);
        settings.append(settingsHeader, modelRow, effortRow, settingActions);
        container.append(settings);

        const job = this.status.job;
        const actions = document.createElement('div');
        actions.className = 'reader-symbol-audit-run-actions';
        if (job?.status === 'running') {
            actions.append(text(labels.running(job.completedFiles, job.totalFiles, job.currentFilePath), 'reader-symbol-audit-progress'));
            const cancel = document.createElement('button');
            cancel.type = 'button';
            cancel.className = 'reader-symbol-audit-button is-secondary';
            cancel.textContent = labels.cancel;
            cancel.addEventListener('click', () => void this.act(async () => { this.status = await host.cancel(); }));
            actions.append(cancel);
        } else {
            const start = document.createElement('button');
            start.type = 'button';
            start.className = 'reader-symbol-audit-button';
            start.textContent = labels.start;
            start.addEventListener('click', () => void this.act(async () => { this.status = await host.start(false); }));
            const force = document.createElement('button');
            force.type = 'button';
            force.className = 'reader-symbol-audit-button is-secondary';
            force.textContent = labels.force;
            force.addEventListener('click', () => void this.act(async () => { this.status = await host.start(true); }));
            actions.append(start, force);
            if (job?.status === 'complete') actions.append(text(labels.complete(job.scannedFiles, job.reusedFiles), 'reader-symbol-audit-progress'));
            if (job?.status === 'failed') actions.append(text(labels.failed + (job.error ? '：' + job.error : ''), 'reader-symbol-audit-error'));
            if (job?.status === 'cancelled') actions.append(text(labels.cancelled, 'reader-symbol-audit-progress'));
        }
        container.append(actions);
        container.append(this.reportView(labels));
        if (error) container.append(text(labels.actionFailed + '：' + error, 'reader-symbol-audit-error'));
        host.changed();
    }

    private reportView(labels: ReaderSymbolAuditLabels): HTMLElement {
        const report = this.status?.report;
        const section = document.createElement('section');
        section.className = 'reader-symbol-audit-report';
        if (!report) {
            section.append(text(labels.noReport, 'reader-panel-summary'));
            return section;
        }
        section.append(text(this.status?.reportState === 'current' ? labels.reportCurrent : labels.reportStale, 'reader-symbol-audit-report-state'));
        if (report.hardConflicts.length === 0) section.append(text(labels.noHardConflicts, 'reader-symbol-audit-ok'));
        else {
            section.append(text(labels.hardConflicts(report.hardConflicts.length), 'reader-symbol-audit-conflict-title'));
            report.hardConflicts.slice(0, 12).forEach(conflict => {
                const card = document.createElement('article');
                card.className = 'reader-symbol-audit-conflict';
                const title = document.createElement('strong');
                title.textContent = conflict.expression;
                card.append(title, text(conflict.reason));
                conflict.bindings.slice(0, 5).forEach(binding => card.append(this.bindingButton(binding, labels)));
                section.append(card);
            });
        }
        if (report.advisories.length === 0) section.append(text(labels.noAdvisories, 'reader-symbol-audit-ok'));
        else {
            section.append(text(labels.possibleConfusion(report.advisories.length), 'reader-symbol-audit-conflict-title'));
            report.advisories.slice(0, 12).forEach(advisory => {
                const item = document.createElement('article');
                item.className = 'reader-symbol-audit-advisory is-' + advisory.severity;
                item.append(text(advisory.expression + ' · ' + advisory.reason));
                section.append(item);
            });
        }
        return section;
    }

    private bindingButton(binding: ReaderSymbolAuditBinding, labels: ReaderSymbolAuditLabels): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'reader-symbol-audit-source';
        button.textContent = `${binding.filePath}:${binding.startLine} · ${binding.bindingKey} — ${binding.meaning}`;
        button.dataset.tooltip = labels.locate;
        button.setAttribute('aria-label', labels.locate + ' ' + button.textContent);
        button.addEventListener('click', () => this.host?.locate(binding.filePath, binding.startLine));
        return button;
    }

    private async loadModels(): Promise<void> {
        if (!this.host || this.busy) return;
        this.busy = true;
        try {
            this.models = await this.host.loadModels();
            this.draw();
        } catch (error) {
            this.draw(this.host.labels().modelLoadFailed + '：' + (error instanceof Error ? error.message : String(error)));
        } finally {
            this.busy = false;
        }
    }

    private async act(operation: () => Promise<void>): Promise<void> {
        if (!this.host || this.busy) return;
        this.busy = true;
        try {
            await operation();
            this.draw();
            if (this.status?.job?.status === 'running') this.pollTimer = window.setTimeout(() => void this.refresh(), 160);
        } catch (error) {
            this.draw(error instanceof Error ? error.message : String(error));
        } finally {
            this.busy = false;
        }
    }
}
