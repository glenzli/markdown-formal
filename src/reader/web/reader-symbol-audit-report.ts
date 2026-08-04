import { renderReaderFormula } from './formal-renderer';
import { readerIcon } from './reader-icons';
import type {
    ReaderSymbolAuditBinding,
    ReaderSymbolAuditReport,
    ReaderSymbolAuditStatus
} from './reader-symbol-audit';

type Language = 'zh' | 'en';

const LEGACY_DETERMINISTIC_REASON = 'A declared special symbol and another distinct binding share the same notation.';

export interface ReaderSymbolAuditReportHost {
    language: Language;
    sourceTitle: (filePath: string) => string;
    locate: (filePath: string, line: number) => void;
    close: () => void;
}

const reportWords = {
    zh: {
        title: '符号审计报告',
        eyebrow: 'Math Workspace · 本机审计',
        cachedNotice: '这是由本机缓存即时生成的虚拟报告，不属于项目正文，也不会写入 Git。',
        current: '与当前源文件一致',
        stale: '报告已过期：源文件或模型设置已变化',
        close: '返回正文',
        createdAt: '生成时间',
        model: '模型',
        effort: '强度',
        scope: '范围',
        files: (count: number) => `${count} 页`,
        cache: '提取缓存',
        cacheValue: (scanned: number, reused: number) => `${scanned} 页新提取 · ${reused} 页复用`,
        hardConflicts: '高置信冲突',
        legacyCandidates: '旧版未归并候选',
        possibleConfusion: '待人工核对',
        reconciled: '已归并',
        bindings: '符号绑定',
        externalBindings: '范围外专用记号',
        hardSection: '高置信冲突',
        hardIntro: '这些候选已经排除同义复述、特化与兼容复用，模型仍判断其语义不相容且作用域重叠；它们应优先回到源文件确认。',
        legacySection: '旧版未归并候选',
        legacyIntro: '这份旧报告在语义归并之前直接按 bindingKey 差异计数，不能视为冲突结论。重新运行审计会复用逐章提取缓存，只执行集中归并。',
        noHard: '语义归并后未发现高置信冲突。',
        reviewSection: '待人工核对',
        reviewIntro: '这些候选的现有证据不足，或虽可兼容复用但仍有阅读混淆风险；这里不把它们直接判为错误。',
        noReview: '未留下需要人工核对的候选。',
        reconciledSection: (count: number) => `查看已归并的 ${count} 项`,
        reconciledIntro: '这些同形写法已识别为同一绑定、明确特化或低风险兼容复用，不计入冲突。',
        sameBinding: '同一绑定',
        specialization: '特化',
        compatibleReuse: '兼容复用',
        uncertain: '证据不足',
        conflict: '冲突',
        deterministicReason: '旧版报告仅因 bindingKey 不同而判定；请重新运行审计完成语义归并。',
        special: '专用',
        temporary: '临时',
        semanticType: '语义类型',
        scopeLabel: '作用域',
        confidence: '提取置信度',
        evidence: '提取依据',
        locate: '打开源文',
        unknownModel: '跟随 Codex 默认',
        usage: '本次用量',
        usageUnavailable: 'Codex Server 未提供精确统计',
        usageValue: (total: number, input: number, output: number) => `${total.toLocaleString()} tokens · 输入 ${input.toLocaleString()} · 输出 ${output.toLocaleString()}`
    },
    en: {
        title: 'Symbol audit report',
        eyebrow: 'Math Workspace · Local audit',
        cachedNotice: 'This virtual report is generated from the local cache. It is not project prose and is never written to Git.',
        current: 'Current with the source files',
        stale: 'Stale: source files or model settings have changed',
        close: 'Back to source',
        createdAt: 'Generated',
        model: 'Model',
        effort: 'Effort',
        scope: 'Scope',
        files: (count: number) => `${count} page${count === 1 ? '' : 's'}`,
        cache: 'Extraction cache',
        cacheValue: (scanned: number, reused: number) => `${scanned} newly extracted · ${reused} reused`,
        hardConflicts: 'High-confidence conflicts',
        legacyCandidates: 'Unreconciled legacy candidates',
        possibleConfusion: 'Needs review',
        reconciled: 'Reconciled',
        bindings: 'Symbol bindings',
        externalBindings: 'Out-of-scope declared notation',
        hardSection: 'High-confidence conflicts',
        hardIntro: 'Restatements, specializations, and compatible reuse have been excluded. The remaining candidates were judged semantically incompatible with overlapping scope and should be checked against the source first.',
        legacySection: 'Unreconciled legacy candidates',
        legacyIntro: 'This legacy report counted binding-key differences before semantic reconciliation, so its entries are not conflict conclusions. Re-running the audit reuses per-file extraction caches and performs only the reconciliation pass.',
        noHard: 'No high-confidence conflict remains after semantic reconciliation.',
        reviewSection: 'Needs manual review',
        reviewIntro: 'The evidence is insufficient, or compatible reuse still presents a reading risk. These candidates are not classified as errors.',
        noReview: 'No candidate remains for manual review.',
        reconciledSection: (count: number) => `View ${count} reconciled candidate${count === 1 ? '' : 's'}`,
        reconciledIntro: 'These same-surface forms were identified as the same binding, an explicit specialization, or low-risk compatible reuse and are not counted as conflicts.',
        sameBinding: 'Same binding',
        specialization: 'Specialization',
        compatibleReuse: 'Compatible reuse',
        uncertain: 'Insufficient evidence',
        conflict: 'Conflict',
        deterministicReason: 'This legacy report classified different binding keys directly. Re-run the audit to perform semantic reconciliation.',
        special: 'Declared',
        temporary: 'Temporary',
        semanticType: 'Semantic type',
        scopeLabel: 'Scope',
        confidence: 'Extraction confidence',
        evidence: 'Evidence',
        locate: 'Open source',
        unknownModel: 'Follow Codex default',
        usage: 'Run usage',
        usageUnavailable: 'Codex Server did not provide an exact count',
        usageValue: (total: number, input: number, output: number) => `${total.toLocaleString()} tokens · ${input.toLocaleString()} input · ${output.toLocaleString()} output`
    }
} as const;

function paragraph(value: string, className?: string): HTMLParagraphElement {
    const element = document.createElement('p');
    if (className) element.className = className;
    element.textContent = value;
    return element;
}

function heading(level: 1 | 2 | 3, value: string): HTMLHeadingElement {
    const element = document.createElement(`h${level}`) as HTMLHeadingElement;
    element.textContent = value;
    return element;
}

function formula(expression: string, display = false): HTMLElement {
    const element = document.createElement(display ? 'div' : 'span');
    element.className = 'reader-symbol-audit-report-formula' + (display ? ' is-display' : '');
    element.innerHTML = renderReaderFormula({ latex: expression, display });
    return element;
}

function metric(label: string, value: string | number, tone = ''): HTMLElement {
    const element = document.createElement('div');
    element.className = 'reader-symbol-audit-report-metric' + (tone ? ` is-${tone}` : '');
    const count = document.createElement('strong');
    count.textContent = String(value);
    const caption = document.createElement('span');
    caption.textContent = label;
    element.append(count, caption);
    return element;
}

function metadata(label: string, value: string): HTMLElement {
    const element = document.createElement('div');
    const term = document.createElement('dt');
    const detail = document.createElement('dd');
    term.textContent = label;
    detail.textContent = value;
    element.append(term, detail);
    return element;
}

function sourceLocation(binding: ReaderSymbolAuditBinding, host: ReaderSymbolAuditReportHost): string {
    return `${host.sourceTitle(binding.filePath)}:${binding.startLine}`;
}

function bindingView(binding: ReaderSymbolAuditBinding, host: ReaderSymbolAuditReportHost): HTMLElement {
    const words = reportWords[host.language];
    const article = document.createElement('article');
    article.className = 'reader-symbol-audit-report-binding';
    const header = document.createElement('header');
    const kind = document.createElement('span');
    kind.className = 'reader-symbol-audit-report-kind is-' + binding.kind;
    kind.textContent = binding.kind === 'special' ? words.special : words.temporary;
    const key = document.createElement('code');
    key.textContent = binding.bindingKey;
    header.append(kind, key);
    const meaning = paragraph(binding.meaning, 'reader-symbol-audit-report-meaning');
    const details = document.createElement('dl');
    details.className = 'reader-symbol-audit-report-binding-details';
    if (binding.semanticType) details.append(metadata(words.semanticType, binding.semanticType));
    if (binding.scope) details.append(metadata(words.scopeLabel, binding.scope));
    if (binding.confidence) details.append(metadata(words.confidence, binding.confidence));
    if (binding.evidence) details.append(metadata(words.evidence, binding.evidence));
    const locate = document.createElement('button');
    locate.type = 'button';
    locate.className = 'reader-symbol-audit-report-source';
    locate.append(readerIcon('locate'), document.createTextNode(sourceLocation(binding, host)));
    locate.title = binding.filePath;
    locate.setAttribute('aria-label', `${words.locate} ${sourceLocation(binding, host)}`);
    locate.addEventListener('click', () => host.locate(binding.filePath, binding.startLine));
    article.append(header, meaning);
    if (details.childElementCount) article.append(details);
    article.append(locate);
    return article;
}

function conflictView(
    conflict: ReaderSymbolAuditReport['hardConflicts'][number],
    host: ReaderSymbolAuditReportHost,
    index: number
): HTMLElement {
    const words = reportWords[host.language];
    const article = document.createElement('article');
    article.className = 'reader-symbol-audit-report-entry is-hard';
    const header = document.createElement('header');
    const number = document.createElement('span');
    number.className = 'reader-symbol-audit-report-entry-number';
    number.textContent = String(index + 1).padStart(2, '0');
    header.append(number, formula(conflict.expression));
    const reason = conflict.reason === LEGACY_DETERMINISTIC_REASON ? words.deterministicReason : conflict.reason;
    const bindings = document.createElement('div');
    bindings.className = 'reader-symbol-audit-report-bindings';
    conflict.bindings.forEach(binding => bindings.append(bindingView(binding, host)));
    article.append(header, paragraph(reason, 'reader-symbol-audit-report-reason'), bindings);
    return article;
}

function advisoryView(
    advisory: ReaderSymbolAuditReport['advisories'][number],
    report: ReaderSymbolAuditReport,
    host: ReaderSymbolAuditReportHost,
    index: number
): HTMLElement {
    const article = document.createElement('article');
    article.className = 'reader-symbol-audit-report-entry is-' + advisory.severity;
    const header = document.createElement('header');
    const number = document.createElement('span');
    number.className = 'reader-symbol-audit-report-entry-number';
    number.textContent = String(index + 1).padStart(2, '0');
    header.append(number, formula(advisory.expression));
    const bindingKeys = new Set(advisory.bindingKeys || []);
    const candidate = report.candidates.find(item => item.expression === advisory.expression);
    const candidateBindings = candidate?.bindings.filter(binding => !bindingKeys.size || bindingKeys.has(binding.bindingKey)) || [];
    article.append(header, paragraph(advisory.reason, 'reader-symbol-audit-report-reason'));
    if (candidateBindings.length) {
        const bindings = document.createElement('div');
        bindings.className = 'reader-symbol-audit-report-bindings';
        candidateBindings.forEach(binding => bindings.append(bindingView(binding, host)));
        article.append(bindings);
    }
    return article;
}

function reconciliationView(
    reconciliation: NonNullable<ReaderSymbolAuditReport['reconciliations']>[number],
    report: ReaderSymbolAuditReport,
    host: ReaderSymbolAuditReportHost,
    index: number
): HTMLElement {
    const words = reportWords[host.language];
    const relationLabel = {
        'same-binding': words.sameBinding,
        specialization: words.specialization,
        'compatible-reuse': words.compatibleReuse,
        conflict: words.conflict,
        uncertain: words.uncertain
    }[reconciliation.relation];
    const article = document.createElement('article');
    article.className = 'reader-symbol-audit-report-entry is-resolved';
    const header = document.createElement('header');
    const number = document.createElement('span');
    number.className = 'reader-symbol-audit-report-entry-number';
    number.textContent = String(index + 1).padStart(2, '0');
    const relation = document.createElement('span');
    relation.className = 'reader-symbol-audit-report-relation is-' + reconciliation.relation;
    relation.textContent = relationLabel;
    header.append(number, formula(reconciliation.expression), relation);
    article.append(header, paragraph(reconciliation.reason, 'reader-symbol-audit-report-reason'));
    const candidate = report.candidates.find(item => item.expression === reconciliation.expression);
    if (candidate?.bindings.length) {
        const bindings = document.createElement('div');
        bindings.className = 'reader-symbol-audit-report-bindings';
        candidate.bindings.forEach(binding => bindings.append(bindingView(binding, host)));
        article.append(bindings);
    }
    return article;
}

/** Owns the full-page, read-only projection of a cached symbol-audit report. */
export class ReaderSymbolAuditReportView {
    render(container: HTMLElement, status: ReaderSymbolAuditStatus, host: ReaderSymbolAuditReportHost): void {
        const report = status.report;
        if (!report) return;
        const words = reportWords[host.language];
        const legacyReport = !Array.isArray(report.reconciliations);
        const reconciliations = report.reconciliations || [];
        const resolved = reconciliations.filter(item => (
            item.relation === 'same-binding'
            || item.relation === 'specialization'
            || (item.relation === 'compatible-reuse' && !item.readerRisk)
        ));
        container.replaceChildren();

        const page = document.createElement('section');
        page.className = 'reader-symbol-audit-report-page';
        const hero = document.createElement('header');
        hero.className = 'reader-symbol-audit-report-hero';
        const back = document.createElement('button');
        back.type = 'button';
        back.className = 'reader-symbol-audit-report-back';
        back.append(readerIcon('arrow-left'), document.createTextNode(words.close));
        back.addEventListener('click', host.close);
        const heroCopy = document.createElement('div');
        heroCopy.append(
            paragraph(words.eyebrow, 'reader-symbol-audit-report-eyebrow'),
            heading(1, words.title),
            paragraph(words.cachedNotice, 'reader-symbol-audit-report-notice')
        );
        const state = document.createElement('span');
        state.className = 'reader-symbol-audit-report-state-pill is-' + status.reportState;
        state.textContent = status.reportState === 'current' ? words.current : words.stale;
        hero.append(back, heroCopy, state);

        const summary = document.createElement('section');
        summary.className = 'reader-symbol-audit-report-summary';
        summary.append(
            metric(legacyReport ? words.legacyCandidates : words.hardConflicts, report.hardConflicts.length, legacyReport ? 'review' : report.hardConflicts.length ? 'hard' : 'ok'),
            metric(words.possibleConfusion, report.advisories.length, report.advisories.length ? 'review' : 'ok'),
            metric(words.reconciled, resolved.length, resolved.length ? 'resolved' : 'ok'),
            metric(words.bindings, report.bindingCount),
            metric(words.externalBindings, report.externalSpecialBindingCount || 0)
        );

        const meta = document.createElement('dl');
        meta.className = 'reader-symbol-audit-report-meta';
        const created = new Date(report.createdAt);
        meta.append(
            metadata(words.createdAt, Number.isNaN(created.getTime()) ? report.createdAt : created.toLocaleString()),
            metadata(words.model, report.model || words.unknownModel),
            metadata(words.effort, report.effort || words.unknownModel),
            metadata(words.scope, words.files(status.scope.selectedFilePaths.length)),
            metadata(words.cache, words.cacheValue(report.scannedFiles, report.reusedFiles))
        );
        const job = status.job;
        if (job && job.status !== 'running' && job.modelCalls > 0) {
            meta.append(metadata(words.usage, job.tokenUsage
                ? words.usageValue(job.tokenUsage.totalTokens, job.tokenUsage.inputTokens, job.tokenUsage.outputTokens)
                : words.usageUnavailable));
        }

        const hardSection = document.createElement('section');
        hardSection.className = 'reader-symbol-audit-report-section';
        hardSection.append(
            heading(2, legacyReport ? words.legacySection : words.hardSection),
            paragraph(legacyReport ? words.legacyIntro : words.hardIntro, 'reader-symbol-audit-report-section-intro')
        );
        if (!report.hardConflicts.length) hardSection.append(paragraph(words.noHard, 'reader-symbol-audit-report-empty is-ok'));
        else report.hardConflicts.forEach((conflict, index) => hardSection.append(conflictView(conflict, host, index)));

        const reviewSection = document.createElement('section');
        reviewSection.className = 'reader-symbol-audit-report-section';
        reviewSection.append(heading(2, words.reviewSection), paragraph(words.reviewIntro, 'reader-symbol-audit-report-section-intro'));
        if (!report.advisories.length) reviewSection.append(paragraph(words.noReview, 'reader-symbol-audit-report-empty is-ok'));
        else report.advisories.forEach((advisory, index) => reviewSection.append(advisoryView(advisory, report, host, index)));

        const reconciledSection = document.createElement('details');
        reconciledSection.className = 'reader-symbol-audit-report-reconciled';
        const reconciledSummary = document.createElement('summary');
        reconciledSummary.textContent = words.reconciledSection(resolved.length);
        reconciledSection.append(reconciledSummary, paragraph(words.reconciledIntro, 'reader-symbol-audit-report-section-intro'));
        resolved.forEach((reconciliation, index) => reconciledSection.append(reconciliationView(reconciliation, report, host, index)));

        page.append(hero, summary, meta, hardSection, reviewSection);
        if (resolved.length) page.append(reconciledSection);
        container.append(page);
    }
}
