#!/usr/bin/env node
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

const ROOT = process.cwd();
const CACHE_DIR = path.join(ROOT, '.markdown-formal');
const FORMAL_TYPES = ['prop', 'lemma', 'theorem', 'cor', 'def', 'remark', 'example', 'section'];
const INCREMENTAL_TYPES = new Set(['prop', 'lemma', 'theorem', 'cor']);
const SECTION_TYPES = new Set(['section']);
const HASH_ID_RE = /^h-[a-f0-9]{16,32}$/;
const TMP_ID_RE = /^tmp-[A-Za-z0-9_-]+$/;
const IGNORE_DIRS = new Set(['.git', '.markdown-formal', '.vscode-test', 'node_modules', 'out']);

const DEFAULT_CONFIG = {
    language: 'zh',
    dictionary: {
        zh: { theorem: '定理', lemma: '引理', prop: '命题', cor: '推论', def: '定义', remark: '注', example: '例', section: '§' },
        en: { theorem: 'Theorem', lemma: 'Lemma', prop: 'Proposition', cor: 'Corollary', def: 'Definition', remark: 'Remark', example: 'Example', section: '§' }
    },
    ui: {
        zh: {
            volume: '第 {number} 卷',
            book: '第 {number} 本',
            workspace: '工作区'
        },
        en: {
            volume: 'Volume {number}',
            book: 'Book {number}',
            workspace: 'Workspace'
        }
    }
};

function toPosix(filePath) {
    return filePath.split(path.sep).join('/');
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function unique(values) {
    return [...new Set(values.filter(Boolean))];
}

function mergeConfig(config) {
    const existing = config && typeof config === 'object' ? config : {};
    return {
        ...DEFAULT_CONFIG,
        ...existing,
        language: existing.language === 'en' ? 'en' : 'zh',
        dictionary: {
            zh: { ...DEFAULT_CONFIG.dictionary.zh, ...(existing.dictionary?.zh || {}) },
            en: { ...DEFAULT_CONFIG.dictionary.en, ...(existing.dictionary?.en || {}) }
        },
        ui: {
            zh: { ...DEFAULT_CONFIG.ui.zh, ...(existing.ui?.zh || {}) },
            en: { ...DEFAULT_CONFIG.ui.en, ...(existing.ui?.en || {}) }
        }
    };
}

function getLanguage(config) {
    return config.language === 'en' ? 'en' : 'zh';
}

function formatTemplate(template, values = {}) {
    return template.replace(/\{(\w+)\}/g, (_match, key) => values[key] || '');
}

function uiText(config, key, values = {}) {
    const language = getLanguage(config);
    const text = config.ui?.[language]?.[key] || DEFAULT_CONFIG.ui[language]?.[key] || DEFAULT_CONFIG.ui.zh[key] || '';
    return formatTemplate(text, values);
}

function typeName(config, type) {
    const language = getLanguage(config);
    return config.dictionary?.[language]?.[type] || type;
}

async function ensureCacheDir() {
    await fs.mkdir(CACHE_DIR, { recursive: true });
}

async function readConfig() {
    await ensureCacheDir();
    const configPath = path.join(CACHE_DIR, 'config.json');
    try {
        const raw = JSON.parse(await fs.readFile(configPath, 'utf8'));
        const config = mergeConfig(raw);
        if (JSON.stringify(raw) !== JSON.stringify(config)) {
            await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
        }
        return config;
    } catch (_err) {
        const config = mergeConfig(DEFAULT_CONFIG);
        await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
        return config;
    }
}

async function collectMarkdownFiles(dir = ROOT, acc = []) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.isDirectory()) {
            if (IGNORE_DIRS.has(entry.name)) continue;
            await collectMarkdownFiles(path.join(dir, entry.name), acc);
            continue;
        }
        if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue;
        acc.push(path.join(dir, entry.name));
    }
    return acc.sort((a, b) => toPosix(path.relative(ROOT, a)).localeCompare(toPosix(path.relative(ROOT, b))));
}

function relativePath(filePath) {
    return toPosix(path.relative(ROOT, filePath));
}

function getContentPreview(content, maxLength = 240) {
    const text = content
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[`*_>#~-]+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}...` : text;
}

function stripIgnoredMarkdown(content) {
    return content
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/```[\s\S]*?```/g, '')
        .replace(/~~~[\s\S]*?~~~/g, '')
        .replace(/`[^`\n]*`/g, '');
}

function parseVolumeOrder(value) {
    if (/^\d+$/.test(value)) return parseInt(value, 10);

    const roman = value.toUpperCase();
    if (!/^[IVXLCDM]+$/.test(roman)) return Number.MAX_SAFE_INTEGER;

    const values = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
    let total = 0;
    let previous = 0;
    for (let i = roman.length - 1; i >= 0; i--) {
        const current = values[roman[i]] || 0;
        total += current < previous ? -current : current;
        previous = Math.max(previous, current);
    }
    return total || Number.MAX_SAFE_INTEGER;
}

function inferBookInfo(filePath, config) {
    const segment = filePath
        .split('/')
        .find(part => /^book[-_\s]?(?:\d+|[a-z0-9]+)(?:[-_\s].*)?$/i.test(part));
    if (!segment) {
        return { key: '__workspace__', title: uiText(config, 'workspace'), order: 0 };
    }

    const match = segment.match(/^book[-_\s]?(\d+|[ivxlcdm]+)?(?:[-_\s].*)?$/i);
    const order = match && match[1] ? parseVolumeOrder(match[1]) : Number.MAX_SAFE_INTEGER;
    const title = order === Number.MAX_SAFE_INTEGER ? segment.replace(/[-_]+/g, ' ') : uiText(config, 'book', { number: String(order) });
    return { key: segment.toLowerCase(), title, order };
}

function inferVolumeInfo(filePath, config) {
    const segment = filePath
        .split('/')
        .find(part => /^(?:vol|volume)[-_\s]?(?:\d+|[ivxlcdm]+)(?:[-_\s].*)?$/i.test(part));
    if (!segment) return undefined;

    const match = segment.match(/^(?:vol|volume)[-_\s]?(\d+|[ivxlcdm]+)(?:[-_\s].*)?$/i);
    const order = match ? parseVolumeOrder(match[1]) : Number.MAX_SAFE_INTEGER;
    const title = order === Number.MAX_SAFE_INTEGER ? segment.replace(/[-_]+/g, ' ') : uiText(config, 'volume', { number: String(order) });
    return { key: segment.toLowerCase(), title, order };
}

function getAlphaOrder(value) {
    return value
        .toUpperCase()
        .split('')
        .reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0);
}

function parseNumberingUnit(basename) {
    const chapterMatch = basename.match(/^(\d+)-.*\.md$/i);
    if (chapterMatch) {
        const chapter = parseInt(chapterMatch[1], 10);
        return {
            kind: 'chapter',
            key: `chapter-${chapter}`,
            label: String(chapter),
            order: chapter,
            chapter
        };
    }

    const appendixMatch = basename.match(/^appendix[-_\s]?([a-z]+|\d+)(?:[-_\s].*)?\.md$/i);
    if (!appendixMatch) return undefined;

    const raw = appendixMatch[1];
    const label = /^\d+$/.test(raw) ? raw : raw.toUpperCase();
    const appendixOrder = /^\d+$/.test(raw) ? parseInt(raw, 10) : getAlphaOrder(raw);
    return {
        kind: 'appendix',
        key: `appendix-${label.toLowerCase()}`,
        label,
        order: 100000 + appendixOrder,
        appendix: label
    };
}

function parseSpecialPageKind(basename) {
    if (/^intro\.md$/i.test(basename)) return 'intro';
    if (/^summary\.md$/i.test(basename)) return 'summary';
    return undefined;
}

function getMarkdownTitle(content, fallback) {
    const match = content.match(/^#\s+(.+?)\s*$/m);
    return match ? match[1].trim() : fallback;
}

function fallbackPageTitle(filePath) {
    return path.posix.basename(filePath, '.md')
        .replace(/^\d+-/, '')
        .replace(/^appendix[-_\s]?[a-z0-9]+[-_\s]?/i, '')
        .replace(/[-_]+/g, ' ');
}

function getPageOrder(kind, unit) {
    if (kind === 'intro') return -100000;
    if (kind === 'summary') return 200000;
    return unit ? unit.order : 0;
}

function parseFormalBlockStart(line) {
    const match = line.match(/^:::(prop|lemma|theorem|cor|def|remark|example|section)\s+\{([^}]+)\}\s*$/);
    if (!match) return undefined;

    const inner = match[2];
    const idMatch = inner.match(/#([^\s}]+)/);
    if (!idMatch) return undefined;

    const titleMatch = inner.match(/title="([^"]*)"/);
    return {
        type: match[1],
        id: idMatch[1],
        title: titleMatch ? titleMatch[1] : ''
    };
}

function makeLabelData(pending, itemNumber, sectionNumber, endLine) {
    const content = pending.contentLines.join('\n');
    const label: any = {
        type: pending.type,
        title: pending.title,
        filePath: pending.filePath,
        bookKey: pending.book.key,
        bookTitle: pending.book.title,
        bookOrder: pending.book.order,
        unitKind: pending.unit.kind,
        unitKey: pending.unit.key,
        unitLabel: pending.unit.label,
        unitOrder: pending.unit.order,
        content,
        contentPreview: getContentPreview(content),
        startLine: pending.startLine,
        endLine
    };

    if (pending.unit.chapter !== undefined) label.chapter = pending.unit.chapter;
    if (pending.unit.appendix !== undefined) label.appendix = pending.unit.appendix;
    if (INCREMENTAL_TYPES.has(pending.type)) label.number = itemNumber;
    if (SECTION_TYPES.has(pending.type)) label.number = sectionNumber;
    if (pending.volume) {
        label.volumeKey = pending.volume.key;
        label.volumeTitle = pending.volume.title;
        label.volumeOrder = pending.volume.order;
    }
    return label;
}

async function scanWorkspace() {
    const config = await readConfig();
    const files = await collectMarkdownFiles();
    const labels = {};
    const definitions = [];
    const references = [];
    const pages = [];
    const issues = [];
    const unitFiles = new Map();

    for (const fullPath of files) {
        const filePath = relativePath(fullPath);
        const basename = path.basename(fullPath);
        const content = await fs.readFile(fullPath, 'utf8');
        const book = inferBookInfo(filePath, config);
        const volume = inferVolumeInfo(filePath, config);
        const unit = parseNumberingUnit(basename);
        const specialKind = parseSpecialPageKind(basename);

        if (unit || specialKind) {
            const kind = unit ? unit.kind : specialKind;
            const page: any = {
                kind,
                filePath,
                title: getMarkdownTitle(content, fallbackPageTitle(filePath)),
                order: getPageOrder(kind, unit),
                bookKey: book.key,
                bookTitle: book.title,
                bookOrder: book.order
            };
            if (volume) {
                page.volumeKey = volume.key;
                page.volumeTitle = volume.title;
                page.volumeOrder = volume.order;
            }
            if (unit) {
                page.unitKind = unit.kind;
                page.unitKey = unit.key;
                page.unitLabel = unit.label;
                page.unitOrder = unit.order;
                if (unit.chapter !== undefined) page.chapter = unit.chapter;
                if (unit.appendix !== undefined) page.appendix = unit.appendix;
            }
            pages.push(page);
        }

        collectReferences(content, filePath, references);
        const blockStarts = collectBlockStarts(content, filePath, issues);
        if (blockStarts.length > 0 && !unit) {
            issues.push({
                severity: 'warn',
                code: 'formal-block-outside-numbered-file',
                file: filePath,
                message: 'Formal blocks are only numbered in NN-title.md or appendix-a-title.md files.'
            });
        }

        if (!unit) continue;
        const volumeKey = volume?.key || '__root__';
        const scopeKey = unit.kind === 'appendix' ? `${book.key}:${volumeKey}:${unit.key}` : `${book.key}:${unit.key}`;
        if (!unitFiles.has(scopeKey)) unitFiles.set(scopeKey, []);
        unitFiles.get(scopeKey).push({ fullPath, filePath, book, volume, unit });
    }

    for (const groupFiles of unitFiles.values()) {
        groupFiles.sort((a, b) => a.filePath.localeCompare(b.filePath));
        let itemCounter = 1;
        let sectionCounter = 1;

        for (const unitFile of groupFiles) {
            const content = await fs.readFile(unitFile.fullPath, 'utf8');
            const lines = content.split(/\r?\n/);
            let pending;
            let inFence = false;

            for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
                const line = lines[lineIndex];
                if (/^\s*(```|~~~)/.test(line)) {
                    inFence = !inFence;
                    if (pending) pending.contentLines.push(line);
                    continue;
                }

                if (pending) {
                    if (!inFence && /^:::\s*$/.test(line)) {
                        const itemNumber = INCREMENTAL_TYPES.has(pending.type) ? itemCounter++ : undefined;
                        const sectionNumber = SECTION_TYPES.has(pending.type) ? sectionCounter++ : undefined;
                        const label = makeLabelData(pending, itemNumber, sectionNumber, lineIndex);
                        labels[pending.id] = label;
                        definitions.push({
                            id: pending.id,
                            type: pending.type,
                            title: pending.title,
                            file: pending.filePath,
                            line: pending.startLine + 1,
                            label
                        });
                        pending = undefined;
                        continue;
                    }
                    pending.contentLines.push(line);
                    continue;
                }

                if (inFence) continue;
                const block = parseFormalBlockStart(line);
                if (!block) continue;
                pending = {
                    ...block,
                    filePath: unitFile.filePath,
                    book: unitFile.book,
                    volume: unitFile.volume,
                    unit: unitFile.unit,
                    startLine: lineIndex,
                    contentLines: []
                };
            }

            if (pending) {
                issues.push({
                    severity: 'error',
                    code: 'unclosed-formal-block',
                    file: pending.filePath,
                    line: pending.startLine + 1,
                    message: `Missing closing ::: for #${pending.id}.`
                });
            }
        }
    }

    issues.push(...lintDefinitions(definitions));
    issues.push(...lintReferences(references, labels, definitions));
    issues.push(...lintPages(pages));

    definitions.sort(compareDefinitionRecords);
    pages.sort(comparePages);
    const inventory = buildInventory(definitions, config);
    return { config, files, labels, pages, definitions, references, inventory, issues };
}

function collectBlockStarts(content, filePath, issues) {
    const starts = [];
    const lines = content.split(/\r?\n/);
    let inFence = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/^\s*(```|~~~)/.test(line)) {
            inFence = !inFence;
            continue;
        }
        if (inFence) continue;
        const block = parseFormalBlockStart(line);
        if (block) starts.push({ ...block, file: filePath, line: i + 1 });
        const malformed = line.match(/^:::(prop|lemma|theorem|cor|def|remark|example|section)\b/);
        if (malformed && !block) {
            issues.push({
                severity: 'error',
                code: 'malformed-formal-block',
                file: filePath,
                line: i + 1,
                message: 'Formal block start must be :::type {#id title="..."} on one line.'
            });
        }
    }
    return starts;
}

function collectReferences(content, filePath, references) {
    const stripped = stripIgnoredMarkdown(content);
    const lineStarts = [0];
    for (let i = 0; i < stripped.length; i++) {
        if (stripped[i] === '\n') lineStarts.push(i + 1);
    }

    const refRe = /(^|[^A-Za-z0-9_])@([A-Za-z0-9_-]+)(?:\.title)?\b/g;
    let match;
    while ((match = refRe.exec(stripped))) {
        const offset = match.index + match[1].length;
        const line = findLineForOffset(lineStarts, offset);
        references.push({ id: match[2], file: filePath, line });
    }
}

function findLineForOffset(lineStarts, offset) {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (lineStarts[mid] <= offset) low = mid + 1;
        else high = mid - 1;
    }
    return high + 1;
}

function lintDefinitions(definitions) {
    const issues = [];
    const byId = new Map();
    for (const def of definitions) {
        if (!byId.has(def.id)) byId.set(def.id, []);
        byId.get(def.id).push(def);

        if (TMP_ID_RE.test(def.id)) {
            issues.push({
                severity: 'error',
                code: 'tmp-id-left',
                file: def.file,
                line: def.line,
                message: `Temporary id #${def.id} remains. Run npm run formal -- finalize <file>.`
            });
        } else if (!HASH_ID_RE.test(def.id)) {
            issues.push({
                severity: 'warn',
                code: 'non-hash-id',
                file: def.file,
                line: def.line,
                message: `Formal id #${def.id} is not a pure hash id.`
            });
        }
    }

    for (const [id, defs] of byId) {
        if (defs.length <= 1) continue;
        defs.forEach(def => {
            issues.push({
                severity: 'error',
                code: 'duplicate-id',
                file: def.file,
                line: def.line,
                message: `Duplicate formal id #${id}.`
            });
        });
    }
    return issues;
}

function lintReferences(references, labels, definitions) {
    const issues = [];
    const definedIds = new Set(Object.keys(labels));
    const tmpDefs = new Set(definitions.filter(def => TMP_ID_RE.test(def.id)).map(def => def.id));
    for (const ref of references) {
        if (TMP_ID_RE.test(ref.id)) {
            issues.push({
                severity: tmpDefs.has(ref.id) ? 'error' : 'error',
                code: 'tmp-ref-left',
                file: ref.file,
                line: ref.line,
                message: `Temporary reference @${ref.id} remains. Run finalize before committing.`
            });
            continue;
        }
        if (!definedIds.has(ref.id)) {
            issues.push({
                severity: 'error',
                code: 'missing-ref',
                file: ref.file,
                line: ref.line,
                message: `Reference @${ref.id} has no matching formal block.`
            });
        }
    }
    return issues;
}

function lintPages(pages) {
    const issues = [];
    const chaptersByBook = new Map();
    const specialByScope = new Map();

    for (const page of pages) {
        if (page.kind === 'chapter' && typeof page.chapter === 'number') {
            if (!chaptersByBook.has(page.bookKey)) chaptersByBook.set(page.bookKey, []);
            chaptersByBook.get(page.bookKey).push(page);
        }
        if (page.kind === 'intro' || page.kind === 'summary') {
            const key = `${page.bookKey}:${page.volumeKey || '__root__'}:${page.kind}`;
            if (!specialByScope.has(key)) specialByScope.set(key, []);
            specialByScope.get(key).push(page);
        }
    }

    for (const chapterPages of chaptersByBook.values()) {
        const sorted = [...chapterPages].sort((a, b) => a.chapter - b.chapter);
        for (let i = 1; i < sorted.length; i++) {
            if (sorted[i].chapter === sorted[i - 1].chapter) {
                issues.push({
                    severity: 'error',
                    code: 'duplicate-chapter',
                    file: sorted[i].filePath,
                    message: `Chapter ${sorted[i].chapter} is duplicated in ${sorted[i].bookTitle}.`
                });
            }
            if (sorted[i].chapter !== sorted[i - 1].chapter + 1) {
                issues.push({
                    severity: 'warn',
                    code: 'chapter-gap',
                    file: sorted[i].filePath,
                    message: `${sorted[i].bookTitle} jumps from chapter ${sorted[i - 1].chapter} to ${sorted[i].chapter}.`
                });
            }
        }
    }

    for (const entries of specialByScope.values()) {
        if (entries.length <= 1) continue;
        entries.slice(1).forEach(page => {
            issues.push({
                severity: 'warn',
                code: 'duplicate-special-page',
                file: page.filePath,
                message: `Duplicate ${page.kind}.md in the same book/volume scope.`
            });
        });
    }

    return issues;
}

function comparePages(a, b) {
    if (a.bookOrder !== b.bookOrder) return a.bookOrder - b.bookOrder;
    if ((a.volumeOrder || 0) !== (b.volumeOrder || 0)) return (a.volumeOrder || 0) - (b.volumeOrder || 0);
    if (a.order !== b.order) return a.order - b.order;
    return a.filePath.localeCompare(b.filePath);
}

function compareDefinitionRecords(a, b) {
    const la = a.label;
    const lb = b.label;
    if (la.bookOrder !== lb.bookOrder) return la.bookOrder - lb.bookOrder;
    if ((la.volumeOrder || 0) !== (lb.volumeOrder || 0)) return (la.volumeOrder || 0) - (lb.volumeOrder || 0);
    if (la.unitOrder !== lb.unitOrder) return la.unitOrder - lb.unitOrder;
    return a.file.localeCompare(b.file) || a.line - b.line;
}

function formatLabelNumber(label) {
    const prefix = label.unitLabel || (label.chapter !== undefined ? String(label.chapter) : label.appendix || '');
    return prefix && label.number !== undefined ? `${prefix}.${label.number}` : '';
}

function displayLabel(def, config) {
    const name = typeName(config, def.type);
    if (def.type === 'section') {
        const number = formatLabelNumber(def.label);
        return number ? `${name} ${number}` : name;
    }

    const number = formatLabelNumber(def.label);
    return number ? `${name} ${number}` : name;
}

function displayNumber(def) {
    return formatLabelNumber(def.label);
}

function buildInventory(definitions, config) {
    const inventory = {};
    for (const def of definitions) {
        inventory[def.id] = {
            type: def.type,
            display: displayLabel(def, config),
            title: def.title,
            file: def.file,
            line: def.line,
            book: def.label.bookTitle,
            unit: def.label.unitKey,
            preview: def.label.contentPreview,
            content: def.label.content
        };
    }
    return inventory;
}

function renderReferenceMap(definitions, config) {
    const lines = [
        '# Reference Map',
        '',
        'Generated by `npm run formal -- prepare`. Read this file to map human display numbers to stable hash IDs.',
        ''
    ];

    let currentBook = '';
    for (const def of definitions) {
        const book = def.label.bookTitle || 'Workspace';
        if (book !== currentBook) {
            currentBook = book;
            lines.push(`## ${book}`, '');
            lines.push('| Display | ID | Title | Location |');
            lines.push('| --- | --- | --- | --- |');
        }
        const title = def.title || '';
        lines.push(`| ${displayLabel(def, config)} | \`${def.id}\` | ${escapeTable(title)} | \`${def.file}:${def.line}\` |`);
    }

    lines.push('');
    return `${lines.join('\n')}\n`;
}

function renderAgentGuide(state) {
    const errors = state.issues.filter(issue => issue.severity === 'error').length;
    const warnings = state.issues.filter(issue => issue.severity !== 'error').length;
    const lines = [
        '# Agent Guide',
        '',
        'Generated by `npm run formal -- prepare`. This is the compact workflow card for AI agents.',
        '',
        `Current cache: ${Object.keys(state.labels).length} labels, ${state.pages.length} pages, ${errors} errors, ${warnings} warnings.`,
        '',
        '## Normal Writing',
        '',
        '1. Read the target Markdown file.',
        '2. Read `.markdown-formal/reference-map.md` to map display numbers to stable hash IDs.',
        '3. Reference existing objects with `@h-...` or `@h-....title`; never handwrite display numbers as references.',
        '4. Create new objects with temporary IDs such as `tmp-1`, `tmp-2`, `tmp-3`.',
        '5. Keep Markdown and LaTeX unescaped so hover preview can render formulas.',
        '6. Run `npm run formal -- finalize <file-or-dir>` after editing, then fix `.markdown-formal/report.md` if needed.',
        '',
        '## Gradual Migration',
        '',
        '- Text references: run `npm run formal -- migrate-text-refs --dry-run <file-or-dir>` before `--apply`.',
        '- Old semantic IDs: run `npm run formal -- migrate-ids --dry-run <file-or-dir>` before `--apply`.',
        '- If scoped ID migration reports outside references, choose a larger closed scope or use `--update-refs-all`.',
        '- Use `--all` only when intentionally migrating the whole project or cross-file temporary references.',
        '',
        '## Generated Files',
        '',
        '- `.markdown-formal/reference-map.md`: compact display-number to hash-ID table.',
        '- `.markdown-formal/inventory.full.json`: full content inventory for deeper lookup.',
        '- `.markdown-formal/report.md`: lint details.',
        '- `.markdown-formal/text-ref-migration.md`: generated only after text-reference migration.',
        ''
    ];
    return `${lines.join('\n')}\n`;
}

function escapeTable(value) {
    return String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function renderReport(state) {
    const errors = state.issues.filter(issue => issue.severity === 'error');
    const warnings = state.issues.filter(issue => issue.severity !== 'error');
    const lines = [
        '# markdown-formal Report',
        '',
        `Labels: ${Object.keys(state.labels).length}`,
        `Pages: ${state.pages.length}`,
        `Errors: ${errors.length}`,
        `Warnings: ${warnings.length}`,
        ''
    ];

    if (errors.length > 0) {
        lines.push('## Errors', '');
        errors.forEach(issue => lines.push(formatIssue(issue)));
        lines.push('');
    }
    if (warnings.length > 0) {
        lines.push('## Warnings', '');
        warnings.forEach(issue => lines.push(formatIssue(issue)));
        lines.push('');
    }
    if (errors.length === 0 && warnings.length === 0) {
        lines.push('No issues found.', '');
    }

    return `${lines.join('\n')}\n`;
}

function formatIssue(issue) {
    const location = issue.line ? `${issue.file}:${issue.line}` : issue.file || 'workspace';
    return `- [${issue.code}] ${location}: ${issue.message}`;
}

async function writeArtifacts(state) {
    await ensureCacheDir();
    await fs.writeFile(path.join(CACHE_DIR, 'labels.json'), `${JSON.stringify(state.labels, null, 2)}\n`, 'utf8');
    await fs.writeFile(path.join(CACHE_DIR, 'pages.json'), `${JSON.stringify(state.pages, null, 2)}\n`, 'utf8');
    await fs.writeFile(path.join(CACHE_DIR, 'inventory.full.json'), `${JSON.stringify(state.inventory, null, 2)}\n`, 'utf8');
    await fs.writeFile(path.join(CACHE_DIR, 'reference-map.md'), renderReferenceMap(state.definitions, state.config), 'utf8');
    await fs.writeFile(path.join(CACHE_DIR, 'agent-guide.md'), renderAgentGuide(state), 'utf8');
    await fs.writeFile(path.join(CACHE_DIR, 'report.md'), renderReport(state), 'utf8');
}

function printSummary(action, state) {
    const errors = state.issues.filter(issue => issue.severity === 'error');
    const warnings = state.issues.filter(issue => issue.severity !== 'error');
    const status = errors.length > 0 ? 'ERROR' : warnings.length > 0 ? 'WARN' : 'OK';
    console.log(`${status} ${action}: ${Object.keys(state.labels).length} labels, ${state.pages.length} pages, ${errors.length} errors, ${warnings.length} warnings`);
    if (errors.length > 0 || warnings.length > 0) {
        console.log('Report: .markdown-formal/report.md');
        [...errors, ...warnings].slice(0, 5).forEach(issue => {
            const location = issue.line ? `${issue.file}:${issue.line}` : issue.file || 'workspace';
            console.log(`${issue.severity.toUpperCase()} ${issue.code} ${location}`);
        });
        if (errors.length + warnings.length > 5) {
            console.log(`... ${errors.length + warnings.length - 5} more issues in report.md`);
        }
    }
}

async function prepare({ exitOnError = true } = {}) {
    const state = await scanWorkspace();
    await writeArtifacts(state);
    printSummary('prepare', state);
    if (exitOnError && state.issues.some(issue => issue.severity === 'error')) process.exitCode = 1;
    return state;
}

async function lint() {
    const state = await scanWorkspace();
    await writeArtifacts(state);
    printSummary('lint', state);
    if (state.issues.some(issue => issue.severity === 'error')) process.exitCode = 1;
}

async function finalize(paths) {
    const options = parseMigrationArgs(paths);
    if (options.paths.length === 0) {
        console.error('Usage: npm run formal -- finalize <file-or-dir> [...] [--all]');
        process.exitCode = 1;
        return;
    }

    const state = await scanWorkspace();
    const targetFiles = await resolveInputMarkdownFiles(options.paths);
    const existingIds = new Set(Object.keys(state.labels).filter(id => !TMP_ID_RE.test(id)));
    const tmpDefs = [];

    for (const filePath of targetFiles) {
        const content = await fs.readFile(filePath, 'utf8');
        const re = /^:::(?:prop|lemma|theorem|cor|def|remark|example|section)\s+\{[^}]*#(tmp-[A-Za-z0-9_-]+)[^}]*\}\s*$/gm;
        let match;
        while ((match = re.exec(content))) {
            tmpDefs.push({ id: match[1], file: relativePath(filePath) });
        }
    }

    const tmpIds = [...new Set(tmpDefs.map(def => def.id))].sort((a, b) => naturalTmpCompare(a, b));
    const duplicateTmp = tmpIds.filter(id => tmpDefs.filter(def => def.id === id).length > 1);
    if (duplicateTmp.length > 0) {
        duplicateTmp.forEach(id => console.error(`Duplicate temporary definition #${id}`));
        process.exitCode = 1;
        return;
    }
    if (tmpIds.length === 0) {
        console.log('OK finalize: no temporary ids found');
        await prepare({ exitOnError: true });
        return;
    }

    const targetFileSet = new Set(targetFiles.map(relativePath));
    const tmpIdSet = new Set(tmpIds);
    const outsideTmpRefs = state.references.filter(ref => tmpIdSet.has(ref.id) && !targetFileSet.has(ref.file));
    if (!options.all && outsideTmpRefs.length > 0) {
        console.error(`Scoped finalize would leave ${outsideTmpRefs.length} cross-file temporary references unresolved.`);
        console.error('Rerun with --all if those cross-file @tmp-* references intentionally point to this target scope.');
        printReferenceSamples(outsideTmpRefs);
        process.exitCode = 1;
        return;
    }

    const mapping = new Map();
    for (const tmpId of tmpIds) {
        let newId;
        do {
            newId = `h-${crypto.randomBytes(8).toString('hex')}`;
        } while (existingIds.has(newId));
        existingIds.add(newId);
        mapping.set(tmpId, newId);
    }

    let changedFiles = 0;
    const rewriteFiles = options.all ? await collectMarkdownFiles() : targetFiles;
    for (const filePath of rewriteFiles) {
        const original = await fs.readFile(filePath, 'utf8');
        let updated = original;
        const prefixPattern = targetFileSet.has(relativePath(filePath)) ? '[#@]' : '@';
        for (const [tmpId, hashId] of mapping) {
            const re = new RegExp(`(${prefixPattern})${escapeRegExp(tmpId)}(?=(?:\\.title)?\\b)`, 'g');
            updated = updated.replace(re, `$1${hashId}`);
        }
        if (updated !== original) {
            await fs.writeFile(filePath, updated, 'utf8');
            changedFiles++;
        }
    }

    console.log(`OK finalize: ${tmpIds.length} ids finalized across ${changedFiles} files`);
    if (!options.all) {
        console.log('Scope: target files only. Use --all to rewrite cross-file @tmp-* references.');
    }
    for (const [tmpId, hashId] of mapping) {
        console.log(`${tmpId} -> ${hashId}`);
    }
    await prepare({ exitOnError: true });
}

function naturalTmpCompare(a, b) {
    const na = a.match(/^tmp-(\d+)$/)?.[1];
    const nb = b.match(/^tmp-(\d+)$/)?.[1];
    if (na && nb) return Number(na) - Number(nb);
    return a.localeCompare(b);
}

async function resolveInputMarkdownFiles(inputs) {
    const result = new Set();
    for (const input of inputs) {
        const full = path.resolve(ROOT, input);
        const stat = await fs.stat(full);
        if (stat.isDirectory()) {
            const files = await collectMarkdownFiles(full, []);
            files.forEach(file => result.add(file));
        } else if (stat.isFile() && full.toLowerCase().endsWith('.md')) {
            result.add(full);
        }
    }
    return [...result].sort((a, b) => relativePath(a).localeCompare(relativePath(b)));
}

async function migrateIds(args) {
    const options = parseMigrationArgs(args);
    const apply = options.apply;
    const dryRun = options.dryRun;
    if (!options.all && options.paths.length === 0) {
        console.error('Usage: npm run formal -- migrate-ids --dry-run <file-or-dir> [...]');
        console.error('       npm run formal -- migrate-ids --apply <file-or-dir> [...]');
        console.error('       npm run formal -- migrate-ids --apply --update-refs-all <file-or-dir> [...]');
        console.error('       npm run formal -- migrate-ids --dry-run --all');
        process.exitCode = 1;
        return;
    }

    const state = await scanWorkspace();
    const allFiles = await collectMarkdownFiles();
    const targetFiles = options.all ? allFiles : await resolveInputMarkdownFiles(options.paths);
    const rewriteFiles = options.all || options.updateRefsAll ? allFiles : targetFiles;
    const targetFileSet = new Set(targetFiles.map(relativePath));
    const idsToMigrate = state.definitions
        .filter(def => targetFileSet.has(def.file))
        .map(def => def.id)
        .filter(id => !HASH_ID_RE.test(id) && !TMP_ID_RE.test(id));
    const uniqueIds = [...new Set(idsToMigrate)].sort();

    if (uniqueIds.length === 0) {
        console.log('OK migrate-ids: no non-hash ids found');
        return;
    }

    const existingIds = new Set(Object.keys(state.labels));
    const mapping = new Map();
    for (const id of uniqueIds) {
        let newId;
        do {
            newId = `h-${crypto.randomBytes(8).toString('hex')}`;
        } while (existingIds.has(newId));
        existingIds.add(newId);
        mapping.set(id, newId);
    }

    console.log(`${dryRun ? 'DRY-RUN' : 'APPLY'} migrate-ids: ${mapping.size} ids`);
    for (const [oldId, newId] of mapping) {
        console.log(`${oldId} -> ${newId}`);
    }

    const migratedIdSet = new Set(uniqueIds);
    const outsideRefs = state.references.filter(ref => migratedIdSet.has(ref.id) && !targetFileSet.has(ref.file));
    if (outsideRefs.length > 0 && !options.all && !options.updateRefsAll) {
        console.warn(`Scoped migrate-ids found ${outsideRefs.length} references outside the target scope.`);
        printReferenceSamples(outsideRefs);
        if (apply) {
            console.error('Refusing to apply because those outside references would point to removed IDs.');
            console.error('Use --update-refs-all to migrate only target definitions while updating all incoming references, or choose a closed chapter/volume scope.');
            process.exitCode = 1;
            return;
        }
    }

    if (!apply) return;

    let changedFiles = 0;
    for (const filePath of rewriteFiles) {
        const original = await fs.readFile(filePath, 'utf8');
        let updated = original;
        const prefixPattern = targetFileSet.has(relativePath(filePath)) ? '[#@]' : '@';
        for (const [oldId, newId] of mapping) {
            const re = new RegExp(`(${prefixPattern})${escapeRegExp(oldId)}(?=(?:\\.title)?\\b)`, 'g');
            updated = updated.replace(re, `$1${newId}`);
        }
        if (updated !== original) {
            await fs.writeFile(filePath, updated, 'utf8');
            changedFiles++;
        }
    }

    console.log(`Updated ${changedFiles} files.`);
    if (!options.all) {
        const scopeText = options.updateRefsAll
            ? 'target definitions, all incoming references'
            : 'target files only';
        console.log(`Scope: ${scopeText}. Run on later chapters/volumes as you migrate them.`);
    }
    await prepare({ exitOnError: true });
}

function printReferenceSamples(references, limit = 5) {
    for (const ref of references.slice(0, limit)) {
        console.log(`  ${ref.file}:${ref.line} @${ref.id}`);
    }
    if (references.length > limit) {
        console.log(`  ... ${references.length - limit} more`);
    }
}

function parseMigrationArgs(args) {
    return {
        apply: args.includes('--apply'),
        dryRun: args.includes('--dry-run') || !args.includes('--apply'),
        all: args.includes('--all'),
        updateRefsAll: args.includes('--update-refs-all'),
        paths: args.filter(arg => !arg.startsWith('--'))
    };
}

function textReferenceAliases(def, config) {
    const number = displayNumber(def);
    if (!number) return [];

    const aliases = [];
    const zhTypes = {
        theorem: '定理',
        lemma: '引理',
        prop: '命题',
        cor: '推论',
        section: '节'
    };
    const enTypes = {
        theorem: 'Theorem',
        lemma: 'Lemma',
        prop: 'Proposition',
        cor: 'Corollary',
        section: 'Section'
    };
    const shortEnTypes = {
        theorem: 'Thm.',
        lemma: 'Lem.',
        prop: 'Prop.',
        cor: 'Cor.',
        section: 'Sec.'
    };

    const zh = zhTypes[def.type];
    if (zh) {
        aliases.push(`${zh}${number}`, `${zh} ${number}`);
    }

    const en = enTypes[def.type];
    if (en) {
        aliases.push(`${en} ${number}`);
    }

    const shortEn = shortEnTypes[def.type];
    if (shortEn) {
        aliases.push(`${shortEn} ${number}`);
    }

    if (def.type === 'section') {
        aliases.push(`§ ${number}`, `§${number}`, `${number}节`, `${number} 节`);
    }

    // Honor custom dictionary labels as aliases when they are numbered.
    const configuredName = typeName(config, def.type);
    if (configuredName && configuredName !== zh && configuredName !== en) {
        aliases.push(`${configuredName}${number}`, `${configuredName} ${number}`);
    }

    return unique(aliases);
}

function buildTextReferenceIndex(definitions, config) {
    const byAlias = new Map();
    for (const def of definitions) {
        for (const alias of textReferenceAliases(def, config)) {
            const key = normalizeTextReferenceAlias(alias);
            if (!byAlias.has(key)) byAlias.set(key, []);
            const defs = byAlias.get(key);
            if (!defs.some(existing => existing.id === def.id)) defs.push(def);
        }
    }
    return byAlias;
}

function normalizeTextReferenceAlias(value) {
    const alias = value.trim().replace(/\s+/g, ' ');
    const number = '([A-Z]+(?:\\.\\d+)+|\\d+(?:\\.\\d+)+)';
    const cjk = alias.match(new RegExp(`^(定理|引理|命题|推论|节)\\s*${number}$`));
    if (cjk) return `${cjk[1]}${cjk[2]}`;
    const cjkSectionSuffix = alias.match(new RegExp(`^${number}\\s*节$`));
    if (cjkSectionSuffix) return `${cjkSectionSuffix[1]}节`;
    const sectionSymbol = alias.match(new RegExp(`^§\\s*${number}$`));
    if (sectionSymbol) return `§${sectionSymbol[1]}`;
    return alias;
}

function makeTextReferencePattern(config) {
    const configuredTypes = FORMAL_TYPES
        .map(type => typeName(config, type))
        .filter(name => name && name !== '§');
    const typeWords = unique([
        '定理',
        '引理',
        '命题',
        '推论',
        '节',
        'Theorem',
        'Lemma',
        'Proposition',
        'Corollary',
        'Section',
        'Thm\\.',
        'Lem\\.',
        'Prop\\.',
        'Cor\\.',
        'Sec\\.',
        ...configuredTypes.map(escapeRegExp)
    ]).join('|');
    const number = '[A-Z]+(?:\\.\\d+)+|\\d+(?:\\.\\d+)+';
    return new RegExp(`(^|[^@#A-Za-z0-9_])((?:(?:${typeWords})\\s*(?:${number}))|(?:§\\s*(?:${number}))|(?:(?:${number})\\s*节))(?![A-Za-z0-9_.-])`, 'g');
}

function rewriteTextReferenceLine(line, pattern, byAlias, file, lineNumber, replacements, unresolved, ambiguous) {
    const parts = line.split(/(`[^`]*`)/g);
    let changed = false;

    const updated = parts.map(part => {
        if (part.startsWith('`') && part.endsWith('`')) return part;
        return part.replace(pattern, (match, prefix, alias) => {
            const defs = byAlias.get(normalizeTextReferenceAlias(alias)) || [];
            if (defs.length === 1) {
                const def = defs[0];
                replacements.push({
                    file,
                    line: lineNumber,
                    from: alias,
                    to: `@${def.id}`,
                    id: def.id,
                    title: def.title
                });
                changed = true;
                return `${prefix}@${def.id}`;
            }

            const record = { file, line: lineNumber, text: alias };
            if (defs.length > 1) {
                ambiguous.push({
                    ...record,
                    candidates: defs.map(def => ({
                        id: def.id,
                        display: displayLabel(def, { language: 'zh', dictionary: DEFAULT_CONFIG.dictionary }),
                        title: def.title,
                        file: def.file,
                        line: def.line
                    }))
                });
            } else {
                unresolved.push(record);
            }
            return match;
        });
    }).join('');

    return { line: updated, changed };
}

function rewriteTextReferences(content, file, pattern, byAlias) {
    const lines = content.split(/\r?\n/);
    const eol = content.includes('\r\n') ? '\r\n' : '\n';
    const replacements = [];
    const unresolved = [];
    const ambiguous = [];
    let inFence = false;
    let changed = false;

    const updatedLines = lines.map((line, index) => {
        if (/^\s*(```|~~~)/.test(line)) {
            inFence = !inFence;
            return line;
        }
        if (inFence) return line;
        if (/^:::/.test(line)) return line;

        const result = rewriteTextReferenceLine(
            line,
            pattern,
            byAlias,
            file,
            index + 1,
            replacements,
            unresolved,
            ambiguous
        );
        if (result.changed) changed = true;
        return result.line;
    });

    return {
        content: updatedLines.join(eol),
        changed,
        replacements,
        unresolved,
        ambiguous
    };
}

function renderTextReferenceMigrationReport(result) {
    const lines = [
        '# Text Reference Migration',
        '',
        `Mode: ${result.apply ? 'apply' : 'dry-run'}`,
        `Files scanned: ${result.files}`,
        `Replacements: ${result.replacements.length}`,
        `Unresolved: ${result.unresolved.length}`,
        `Ambiguous: ${result.ambiguous.length}`,
        ''
    ];

    if (result.replacements.length > 0) {
        lines.push('## Replacements', '');
        result.replacements.forEach(item => {
            lines.push(`- ${item.file}:${item.line}: ${item.from} -> @${item.id} (${item.title || 'untitled'})`);
        });
        lines.push('');
    }

    if (result.unresolved.length > 0) {
        lines.push('## Unresolved', '');
        result.unresolved.forEach(item => {
            lines.push(`- ${item.file}:${item.line}: ${item.text}`);
        });
        lines.push('');
    }

    if (result.ambiguous.length > 0) {
        lines.push('## Ambiguous', '');
        result.ambiguous.forEach(item => {
            lines.push(`- ${item.file}:${item.line}: ${item.text}`);
            item.candidates.forEach(candidate => {
                lines.push(`  - ${candidate.id} ${candidate.title || 'untitled'} (${candidate.file}:${candidate.line})`);
            });
        });
        lines.push('');
    }

    return `${lines.join('\n')}\n`;
}

async function migrateTextRefs(args) {
    const options = parseMigrationArgs(args);
    if (!options.all && options.paths.length === 0) {
        console.error('Usage: npm run formal -- migrate-text-refs --dry-run <file-or-dir> [...]');
        console.error('       npm run formal -- migrate-text-refs --apply <file-or-dir> [...]');
        console.error('       npm run formal -- migrate-text-refs --dry-run --all');
        process.exitCode = 1;
        return;
    }

    const state = await scanWorkspace();
    await writeArtifacts(state);
    const byAlias = buildTextReferenceIndex(state.definitions, state.config);
    if (byAlias.size === 0) {
        console.log('OK migrate-text-refs: no numbered formal entries found');
        return;
    }
    const pattern = makeTextReferencePattern(state.config);

    const targetFiles = options.all ? await collectMarkdownFiles() : await resolveInputMarkdownFiles(options.paths);
    const result = {
        apply: options.apply,
        files: targetFiles.length,
        replacements: [],
        unresolved: [],
        ambiguous: []
    };

    let changedFiles = 0;
    for (const fullPath of targetFiles) {
        const file = relativePath(fullPath);
        const original = await fs.readFile(fullPath, 'utf8');
        const rewritten = rewriteTextReferences(original, file, pattern, byAlias);
        result.replacements.push(...rewritten.replacements);
        result.unresolved.push(...rewritten.unresolved);
        result.ambiguous.push(...rewritten.ambiguous);
        if (options.apply && rewritten.changed) {
            await fs.writeFile(fullPath, rewritten.content, 'utf8');
            changedFiles++;
        }
    }

    await ensureCacheDir();
    await fs.writeFile(path.join(CACHE_DIR, 'text-ref-migration.md'), renderTextReferenceMigrationReport(result), 'utf8');

    const mode = options.apply ? 'APPLY' : 'DRY-RUN';
    console.log(`${mode} migrate-text-refs: ${result.replacements.length} replacements, ${result.unresolved.length} unresolved, ${result.ambiguous.length} ambiguous`);
    console.log('Report: .markdown-formal/text-ref-migration.md');

    if (options.apply) {
        console.log(`Updated ${changedFiles} files.`);
        await prepare({ exitOnError: true });
    }
}

async function printReport() {
    try {
        process.stdout.write(await fs.readFile(path.join(CACHE_DIR, 'report.md'), 'utf8'));
    } catch (_err) {
        console.log('No report found. Run: npm run formal -- prepare');
    }
}

function printHelp() {
    console.log(`Usage:
  npm run formal -- prepare
  npm run formal -- lint
  npm run formal -- finalize <file-or-dir> [...] [--all]
  npm run formal -- migrate-text-refs --dry-run <file-or-dir> [...] [--all]
  npm run formal -- migrate-text-refs --apply <file-or-dir> [...] [--all]
  npm run formal -- migrate-ids --dry-run <file-or-dir> [...]
  npm run formal -- migrate-ids --apply <file-or-dir> [...]
  npm run formal -- migrate-ids --apply --update-refs-all <file-or-dir> [...]
  npm run formal -- migrate-ids --dry-run --all
  npm run formal -- migrate-ids --apply --all
  npm run formal -- report

Agent workflow:
  1. Run prepare.
  2. Read .markdown-formal/agent-guide.md and .markdown-formal/reference-map.md.
  3. Use tmp-* for new objects, then run finalize on the edited file or directory.`);
}

async function main() {
    const [command, ...args] = process.argv.slice(2);

    if (!command || command === 'help' || command === '--help') {
        printHelp();
    } else if (command === 'prepare' || command === 'doctor') {
        await prepare({ exitOnError: true });
    } else if (command === 'lint') {
        await lint();
    } else if (command === 'finalize') {
        await finalize(args);
    } else if (command === 'migrate-text-refs') {
        await migrateTextRefs(args);
    } else if (command === 'migrate-ids') {
        await migrateIds(args);
    } else if (command === 'report') {
        await printReport();
    } else {
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exitCode = 1;
    }
}

main().catch(err => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
});
