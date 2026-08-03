export type ProjectKnowledgeSourceKind = 'concept-appendix' | 'glossary' | 'notation-appendix' | 'summary-page';

export interface ProjectKnowledgeSource {
    kind: ProjectKnowledgeSourceKind;
    filePath: string;
    title: string;
    confidence: 'high' | 'medium';
    extractedDefinitions: number;
}

export interface ProjectKnowledgeDefinition {
    title: string;
    filePath: string;
    line: number;
    content: string;
    origin: 'concept-appendix' | 'glossary';
}

export interface ProjectStructureAnalysis {
    schemaVersion: 1;
    generatedBy: 'math-workspace';
    sources: ProjectKnowledgeSource[];
    summary: {
        conceptSources: number;
        notationSources: number;
        summaryPages: number;
        extractedDefinitions: number;
    };
}

export interface ProjectKnowledgeAnalysis {
    project: ProjectStructureAnalysis;
    definitions: ProjectKnowledgeDefinition[];
}

interface ProjectDocument {
    filePath: string;
    content: string;
}

interface Heading {
    level: number;
    line: number;
    title: string;
}

const CONCEPT_NAME_RE = /(?:concepts?|glossary|terminology|definitions?|concept-index|概念|术语|定义)/i;
const NOTATION_NAME_RE = /(?:symbols?|notation|conventions?|符号|记号|约定)/i;
const SUMMARY_NAME_RE = /(?:^|[-_])summary(?:$|[-_])|总结|小结/i;
const GENERIC_HEADING_RE = /^(?:附录\s*[A-Z0-9]*\s*[:：-]?\s*)?(?:概念|术语|定义|符号|记号|约定|目录|索引|说明|范围|总览|概览|引言|导言|参考文献|references?|introduction|overview|scope|notes?)$/i;

function normalizePath(value: string): string {
    return String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function fileStem(filePath: string): string {
    const basename = normalizePath(filePath).split('/').pop() || '';
    return basename.replace(/\.md$/i, '');
}

function normalizeTerm(value: string): string {
    return String(value || '')
        .replace(/#[-A-Za-z0-9_]+\b/g, '')
        .replace(/\{#[^}]+\}/g, '')
        .replace(/[`*_~]/g, '')
        .replace(/^\s*(?:\d+(?:\.\d+)*|[A-Z])\s*[.、:：-]\s*/, '')
        .replace(/^\s*(?:定义|Definition)\s*[（(]([^）)]+)[）)]\s*[:：]?\s*$/i, '$1')
        .replace(/\s+/g, ' ')
        .trim();
}

function parseHeadings(content: string): Heading[] {
    const headings: Heading[] = [];
    let inFence = false;
    String(content || '').split(/\r?\n/).forEach((line, index) => {
        if (/^\s*(```|~~~)/.test(line)) {
            inFence = !inFence;
            return;
        }
        if (inFence) return;
        const match = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*$/);
        if (!match) return;
        const title = normalizeTerm(match[2].replace(/\s+#+\s*$/, ''));
        if (title) headings.push({ level: match[1].length, line: index + 1, title });
    });
    return headings;
}

function sourceKind(document: ProjectDocument, headings: Heading[]): Omit<ProjectKnowledgeSource, 'extractedDefinitions'> | undefined {
    const stem = fileStem(document.filePath);
    const topTitle = headings.length > 0
        ? headings.filter(heading => heading.level === Math.min(...headings.map(item => item.level)))[0]?.title || ''
        : '';
    const appendix = /^appendix[-_\s]?/i.test(stem) || /(?:^|\/)附录/.test(normalizePath(document.filePath));
    const concept = CONCEPT_NAME_RE.test(stem) || CONCEPT_NAME_RE.test(topTitle);
    const notation = NOTATION_NAME_RE.test(stem) || NOTATION_NAME_RE.test(topTitle);
    const summary = SUMMARY_NAME_RE.test(stem) || SUMMARY_NAME_RE.test(topTitle);

    if (appendix && concept) {
        return { kind: /glossary|术语/i.test(`${stem} ${topTitle}`) ? 'glossary' : 'concept-appendix', filePath: normalizePath(document.filePath), title: topTitle || stem, confidence: 'high' };
    }
    if (concept && /(?:glossary|terminology|术语|概念表|核心概念)/i.test(`${stem} ${topTitle}`)) {
        return { kind: 'glossary', filePath: normalizePath(document.filePath), title: topTitle || stem, confidence: 'medium' };
    }
    if (appendix && notation) {
        return { kind: 'notation-appendix', filePath: normalizePath(document.filePath), title: topTitle || stem, confidence: 'high' };
    }
    if (summary) {
        return { kind: 'summary-page', filePath: normalizePath(document.filePath), title: topTitle || stem, confidence: 'medium' };
    }
    return undefined;
}

function tableCells(line: string): string[] {
    const trimmed = line.trim();
    if (!trimmed.includes('|')) return [];
    const body = trimmed.replace(/^\|/, '').replace(/\|$/, '');
    const cells: string[] = [];
    let current = '';
    let escaped = false;
    for (const char of body) {
        if (escaped) {
            current += char;
            escaped = false;
        } else if (char === '\\') {
            current += char;
            escaped = true;
        } else if (char === '|') {
            cells.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    cells.push(current.trim());
    return cells;
}

function isTableDivider(cells: string[]): boolean {
    return cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, '')));
}

function isTermColumn(value: string): boolean {
    return /^(?:术语|概念|名称|名词|term|concept|name)$/i.test(normalizeTerm(value));
}

function isDefinitionColumn(value: string): boolean {
    return /^(?:定义|说明|释义|描述|definition|meaning|description|note)$/i.test(normalizeTerm(value));
}

function candidateContent(lines: string[], heading: Heading, nextHeading: Heading | undefined): string {
    const end = nextHeading ? nextHeading.line - 1 : lines.length;
    const content = lines.slice(heading.line, end)
        .filter(line => !/^\s{0,3}#{1,6}\s+/.test(line))
        .join('\n')
        .trim();
    return content;
}

function headingDefinitions(document: ProjectDocument, source: ProjectKnowledgeSource): ProjectKnowledgeDefinition[] {
    const lines = String(document.content || '').split(/\r?\n/);
    const headings = parseHeadings(document.content);
    if (headings.length < 2) return [];
    const pageLevel = Math.min(...headings.map(heading => heading.level));
    const itemLevel = Math.max(...headings.filter(heading => heading.level > pageLevel).map(heading => heading.level));
    if (!Number.isFinite(itemLevel)) return [];

    return headings
        .filter(heading => heading.level === itemLevel)
        .flatMap(heading => {
            const title = normalizeTerm(heading.title);
            if (!title || GENERIC_HEADING_RE.test(title)) return [];
            const nextHeading = headings.find(candidate => candidate.line > heading.line && candidate.level <= heading.level);
            const content = candidateContent(lines, heading, nextHeading);
            if (content.replace(/\s+/g, '').length < 16) return [];
            return [{
                title,
                filePath: source.filePath,
                line: heading.line,
                content,
                origin: source.kind === 'glossary' ? 'glossary' : 'concept-appendix'
            }];
        });
}

function tableDefinitions(document: ProjectDocument, source: ProjectKnowledgeSource): ProjectKnowledgeDefinition[] {
    const lines = String(document.content || '').split(/\r?\n/);
    const definitions: ProjectKnowledgeDefinition[] = [];
    for (let index = 0; index < lines.length - 2; index++) {
        const headers = tableCells(lines[index]);
        const divider = tableCells(lines[index + 1]);
        if (!headers.length || headers.length !== divider.length || !isTableDivider(divider)) continue;
        const termIndex = headers.findIndex(isTermColumn);
        const definitionIndex = headers.findIndex(isDefinitionColumn);
        if (termIndex < 0 || definitionIndex < 0 || termIndex === definitionIndex) continue;
        for (let row = index + 2; row < lines.length; row++) {
            const cells = tableCells(lines[row]);
            if (cells.length !== headers.length) break;
            const title = normalizeTerm(cells[termIndex]);
            const content = cells[definitionIndex]?.trim() || '';
            if (!title || !content || isTableDivider(cells)) continue;
            definitions.push({
                title,
                filePath: source.filePath,
                line: row + 1,
                content,
                origin: source.kind === 'glossary' ? 'glossary' : 'concept-appendix'
            });
        }
        index++;
    }
    return definitions;
}

function definitionKey(definition: Pick<ProjectKnowledgeDefinition, 'filePath' | 'title'>): string {
    return `${normalizePath(definition.filePath)}:${normalizeTerm(definition.title).toLocaleLowerCase()}`;
}

function uniqueDefinitions(definitions: ProjectKnowledgeDefinition[], existing: Array<{ title?: string; file?: string }> = []): ProjectKnowledgeDefinition[] {
    const existingKeys = new Set(existing.map(definition => definitionKey({ filePath: definition.file || '', title: definition.title || '' })));
    const seen = new Set<string>();
    return definitions.filter(definition => {
        const key = definitionKey(definition);
        if (!definition.title || existingKeys.has(key) || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/**
 * Discovers deliberately named knowledge pages and extracts only their most
 * structural concept entries. It never infers terminology from ordinary prose.
 */
export function analyzeProjectKnowledge(documents: ProjectDocument[], existingDefinitions: Array<{ title?: string; file?: string }> = []): ProjectKnowledgeAnalysis {
    const sourceDocuments = documents
        .map(document => ({ document, headings: parseHeadings(document.content) }))
        .map(({ document, headings }) => ({ document, source: sourceKind(document, headings) }))
        .filter((item): item is { document: ProjectDocument; source: Omit<ProjectKnowledgeSource, 'extractedDefinitions'> } => !!item.source)
        .sort((left, right) => left.source.filePath.localeCompare(right.source.filePath));

    const rawDefinitions = sourceDocuments.flatMap(({ document, source }) => {
        const completed = { ...source, extractedDefinitions: 0 } as ProjectKnowledgeSource;
        if (completed.kind !== 'concept-appendix' && completed.kind !== 'glossary') return [];
        return [...tableDefinitions(document, completed), ...headingDefinitions(document, completed)];
    });
    const definitions = uniqueDefinitions(rawDefinitions, existingDefinitions);
    const definitionCountBySource = new Map<string, number>();
    definitions.forEach(definition => definitionCountBySource.set(definition.filePath, (definitionCountBySource.get(definition.filePath) || 0) + 1));
    const sources = sourceDocuments.map(({ source }) => ({
        ...source,
        extractedDefinitions: definitionCountBySource.get(source.filePath) || 0
    }));
    const summary = {
        conceptSources: sources.filter(source => source.kind === 'concept-appendix' || source.kind === 'glossary').length,
        notationSources: sources.filter(source => source.kind === 'notation-appendix').length,
        summaryPages: sources.filter(source => source.kind === 'summary-page').length,
        extractedDefinitions: definitions.length
    };
    return {
        project: { schemaVersion: 1, generatedBy: 'math-workspace', sources, summary },
        definitions
    };
}
