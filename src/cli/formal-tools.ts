#!/usr/bin/env node
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

import {
    DEFAULT_CONFIG,
    HASH_ID_RE,
    TMP_ID_RE,
    buildPreviewCache,
    displayLabel,
    displayNumber,
    escapeRegExp,
    mergeConfig,
    parseFormalMarkerLine,
    renderAgentGuide,
    renderReferenceMap,
    renderReport,
    scanFormalDocuments,
    toPosix,
    typeName,
    unique
} from '../core/formal-core';

const ROOT = process.cwd();
const CACHE_DIR = path.join(ROOT, '.markdown-formal');
const IGNORE_DIRS = new Set(['.git', '.markdown-formal', '.vscode-test', 'node_modules', 'out']);

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
    return acc.sort((a, b) => relativePath(a).localeCompare(relativePath(b)));
}

function relativePath(filePath) {
    return toPosix(path.relative(ROOT, filePath));
}

async function readWorkspaceDocuments(files) {
    const documents = [];
    for (const fullPath of files) {
        documents.push({
            filePath: relativePath(fullPath),
            content: await fs.readFile(fullPath, 'utf8')
        });
    }
    return documents;
}

async function readSymbols() {
    try {
        return JSON.parse(await fs.readFile(path.join(ROOT, 'formal-symbols.json'), 'utf8'));
    } catch (err: any) {
        if (err?.code === 'ENOENT') return undefined;
        throw err;
    }
}

async function scanWorkspace() {
    const config = await readConfig();
    const files = await collectMarkdownFiles();
    const documents = await readWorkspaceDocuments(files);
    const symbols = await readSymbols();
    return scanFormalDocuments(documents, config, symbols);
}

async function writeArtifacts(state) {
    await ensureCacheDir();
    await fs.writeFile(path.join(CACHE_DIR, 'preview-cache.json'), `${JSON.stringify(buildPreviewCache(state), null, 2)}\n`, 'utf8');
    await fs.writeFile(path.join(CACHE_DIR, 'reference-map.md'), renderReferenceMap(state.definitions, state.config), 'utf8');
    await fs.writeFile(path.join(CACHE_DIR, 'agent-guide.md'), renderAgentGuide(state), 'utf8');
    await fs.writeFile(path.join(CACHE_DIR, 'report.md'), renderReport(state), 'utf8');
    await removeStaleArtifact('definition-index.md');
    await removeStaleArtifact('labels.json');
    await removeStaleArtifact('pages.json');
    await removeStaleArtifact('preview-index.json');
    await removeStaleArtifact('inventory.full.json');
}

async function removeStaleArtifact(fileName) {
    try {
        await fs.rm(path.join(CACHE_DIR, fileName));
    } catch (err: any) {
        if (err?.code !== 'ENOENT') throw err;
    }
}

function printSummary(action, state) {
    const errors = state.issues.filter(issue => issue.severity === 'error');
    const warnings = state.issues.filter(issue => issue.severity !== 'error');
    const status = errors.length > 0 ? 'ERROR' : warnings.length > 0 ? 'WARN' : 'OK';
    console.log(`${status} ${action}: ${Object.keys(state.labels).length} preview entries, ${state.pages.length} pages, ${errors.length} errors, ${warnings.length} warnings`);
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

const VERIFY_BLOCKING_WARNING_CODES = new Set([
    'non-hash-id',
    'formal-marker-outside-numbered-file',
    'duplicate-special-page'
]);

async function readTextReferenceMigrationCounts() {
    try {
        const report = await fs.readFile(path.join(CACHE_DIR, 'text-ref-migration.md'), 'utf8');
        return {
            unresolved: Number(report.match(/^Unresolved:\s*(\d+)/m)?.[1] || 0),
            ambiguous: Number(report.match(/^Ambiguous:\s*(\d+)/m)?.[1] || 0)
        };
    } catch (_err) {
        return { unresolved: 0, ambiguous: 0 };
    }
}

async function verify(args) {
    const strictChapters = args.includes('--strict-chapters');
    const state = await scanWorkspace();
    await writeArtifacts(state);
    printSummary('verify', state);

    const blockingIssues = state.issues.filter(issue => {
        if (issue.severity === 'error') return true;
        if (VERIFY_BLOCKING_WARNING_CODES.has(issue.code)) return true;
        return strictChapters && issue.code === 'chapter-gap';
    });
    const migrationCounts = await readTextReferenceMigrationCounts();
    const hasOpenTextMigration = migrationCounts.unresolved > 0 || migrationCounts.ambiguous > 0;

    if (blockingIssues.length === 0 && !hasOpenTextMigration) {
        console.log('OK verify: generated/ migrated content gate passed');
        return;
    }

    if (blockingIssues.length > 0) {
        console.error(`VERIFY failed: ${blockingIssues.length} blocking issues`);
        blockingIssues.slice(0, 10).forEach(issue => {
            const location = issue.line ? `${issue.file}:${issue.line}` : issue.file || 'workspace';
            console.error(`${issue.code} ${location}: ${issue.message}`);
        });
        if (blockingIssues.length > 10) {
            console.error(`... ${blockingIssues.length - 10} more blocking issues in .markdown-formal/report.md`);
        }
    }

    if (hasOpenTextMigration) {
        console.error(`VERIFY failed: text-reference migration has unresolved=${migrationCounts.unresolved}, ambiguous=${migrationCounts.ambiguous}`);
        console.error('Resolve .markdown-formal/text-ref-migration.md before treating migration as complete.');
    }

    process.exitCode = 1;
}

async function finalize(paths, commandName = 'finalize') {
    const options = parseMigrationArgs(paths);
    if (options.paths.length === 0) {
        console.error(`Usage: npm run formal -- ${commandName} <file-or-dir> [...] [--all]`);
        process.exitCode = 1;
        return;
    }

    const state = await scanWorkspace();
    const targetFiles = await resolveInputMarkdownFiles(options.paths);
    const existingIds = new Set(Object.keys(state.labels).filter(id => !TMP_ID_RE.test(id)));
    const tmpDefs = [];

    for (const filePath of targetFiles) {
        const content = await fs.readFile(filePath, 'utf8');
        const lines = content.split(/\r?\n/);
        let inFence = false;
        for (const line of lines) {
            if (/^\s*(```|~~~)/.test(line)) {
                inFence = !inFence;
                continue;
            }
            if (inFence) continue;
            const marker = parseFormalMarkerLine(line);
            if (marker?.id && TMP_ID_RE.test(marker.id)) {
                tmpDefs.push({ id: marker.id, file: relativePath(filePath) });
            }
        }
    }

    const tmpIds = [...new Set(tmpDefs.map(def => def.id))].sort((a, b) => naturalTmpCompare(a, b));
    const duplicateTmp = tmpIds.filter(id => tmpDefs.filter(def => def.id === id).length > 1);
    if (duplicateTmp.length > 0) {
        duplicateTmp.forEach(id => console.error(`Duplicate temporary marker #${id}`));
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
        const updated = rewriteFormalIds(original, mapping, {
            rewriteDefinitions: targetFileSet.has(relativePath(filePath))
        });
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

async function finish(args) {
    await finalize(args, 'finish');
    if (process.exitCode && process.exitCode !== 0) return;
    await verify([]);
}

function naturalTmpCompare(a, b) {
    const na = a.match(/^tmp-(\d+)$/)?.[1];
    const nb = b.match(/^tmp-(\d+)$/)?.[1];
    if (na && nb) return Number(na) - Number(nb);
    return a.localeCompare(b);
}

function rewriteInlineRefsOutsideCode(line, mapping) {
    const parts = line.split(/(`[^`]*`)/g);
    return parts.map(part => {
        if (part.startsWith('`') && part.endsWith('`')) return part;
        let updated = part;
        for (const [oldId, newId] of mapping) {
            const re = new RegExp(`@${escapeRegExp(oldId)}(?=(?:\\.title)?\\b)`, 'g');
            updated = updated.replace(re, `@${newId}`);
        }
        return updated;
    }).join('');
}

function rewriteMarkerId(line, mapping) {
    const marker = parseFormalMarkerLine(line);
    if (!marker?.id) return line;
    let updated = line;
    for (const [oldId, newId] of mapping) {
        const re = new RegExp(`#${escapeRegExp(oldId)}(?=\\b)`, 'g');
        updated = updated.replace(re, `#${newId}`);
    }
    return updated;
}

function rewriteFormalIds(content, mapping, { rewriteDefinitions }) {
    const lines = content.split(/\r?\n/);
    const eol = content.includes('\r\n') ? '\r\n' : '\n';
    let inFence = false;
    const updated = lines.map(line => {
        if (/^\s*(```|~~~)/.test(line)) {
            inFence = !inFence;
            return line;
        }
        if (inFence) return line;

        let next = rewriteDefinitions ? rewriteMarkerId(line, mapping) : line;
        next = rewriteInlineRefsOutsideCode(next, mapping);
        return next;
    });
    return updated.join(eol);
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
        console.error('Usage: npm run formal -- migrate-ids <file-or-dir> [...] [--apply] [--target-only]');
        console.error('       npm run formal -- migrate-ids --all [--apply]');
        process.exitCode = 1;
        return;
    }

    const state = await scanWorkspace();
    const allFiles = await collectMarkdownFiles();
    const targetFiles = options.all ? allFiles : await resolveInputMarkdownFiles(options.paths);
    const rewriteFiles = migrationRewriteFiles(options, allFiles, targetFiles);
    const targetFileSet = new Set(targetFiles.map(relativePath));
    const idsToMigrate = state.definitions
        .filter(def => targetFileSet.has(def.file))
        .map(def => def.id)
        .filter(id => typeof id === 'string' && !HASH_ID_RE.test(id) && !TMP_ID_RE.test(id));
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
    if (outsideRefs.length > 0 && !options.all && options.targetOnly) {
        console.warn(`Scoped migrate-ids found ${outsideRefs.length} references outside the target scope.`);
        printReferenceSamples(outsideRefs);
        if (apply) {
            console.error('Refusing to apply because those outside references would point to removed IDs.');
            console.error('Omit --target-only to update incoming references, or choose a closed chapter/volume scope.');
            process.exitCode = 1;
            return;
        }
    } else if (outsideRefs.length > 0 && !options.all) {
        console.log(`Incoming references outside target scope will be updated: ${outsideRefs.length}`);
    }

    if (!apply) return;

    let changedFiles = 0;
    for (const filePath of rewriteFiles) {
        const original = await fs.readFile(filePath, 'utf8');
        const updated = rewriteFormalIds(original, mapping, {
            rewriteDefinitions: targetFileSet.has(relativePath(filePath))
        });
        if (updated !== original) {
            await fs.writeFile(filePath, updated, 'utf8');
            changedFiles++;
        }
    }

    console.log(`Updated ${changedFiles} files.`);
    if (!options.all) {
        const scopeText = options.targetOnly
            ? 'target files only'
            : 'target numbered markers, all incoming references';
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
        targetOnly: args.includes('--target-only'),
        paths: args.filter(arg => !arg.startsWith('--'))
    };
}

function migrationRewriteFiles(options, allFiles, targetFiles) {
    return options.all || !options.targetOnly ? allFiles : targetFiles;
}

function migrationReferenceScope(options) {
    if (options.all) return 'all files';
    return options.targetOnly ? 'target files only' : 'target files plus incoming refs across all files';
}

const TEXT_REF_NUMBER = '[A-Z]+(?:[.．]\\d+)+|\\d+(?:[.．]\\d+)+';

function normalizeReferenceNumber(value) {
    return value.replace(/．/g, '.');
}

function pushAlias(byAlias, alias, def) {
    const key = normalizeTextReferenceAlias(alias);
    if (!byAlias.has(key)) byAlias.set(key, []);
    const defs = byAlias.get(key);
    if (!defs.some(existing => existing.id === def.id)) defs.push(def);
}

function numberedReferenceAliases(def, config) {
    const number = displayNumber(def);
    if (!number) return [];

    const aliases = [];
    const zhTypes = {
        theorem: '定理',
        lemma: '引理',
        prop: '命题',
        cor: '推论',
        remark: '注',
        example: '例',
        section: '节'
    };
    const enTypes = {
        theorem: 'Theorem',
        lemma: 'Lemma',
        prop: 'Proposition',
        cor: 'Corollary',
        remark: 'Remark',
        example: 'Example',
        section: 'Section'
    };
    const shortEnTypes = {
        theorem: 'Thm.',
        lemma: 'Lem.',
        prop: 'Prop.',
        cor: 'Cor.',
        remark: 'Rem.',
        example: 'Ex.',
        section: 'Sec.'
    };
    const shortEnNoDotTypes = {
        theorem: 'Thm',
        lemma: 'Lem',
        prop: 'Prop',
        cor: 'Cor',
        remark: 'Rem',
        example: 'Ex',
        section: 'Sec'
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

    const shortEnNoDot = shortEnNoDotTypes[def.type];
    if (shortEnNoDot) {
        aliases.push(`${shortEnNoDot} ${number}`);
    }

    if (def.type === 'section') {
        aliases.push(
            `§ ${number}`,
            `§${number}`,
            `${number}节`,
            `${number} 节`,
            `第${number}节`,
            `第 ${number} 节`,
            `节${number}`,
            `节 ${number}`,
            `小节${number}`,
            `小节 ${number}`,
            `章节${number}`,
            `章节 ${number}`
        );
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
        for (const alias of numberedReferenceAliases(def, config)) {
            pushAlias(byAlias, alias, def);
        }
    }

    return byAlias;
}

function normalizeTextReferenceAlias(value) {
    const alias = value.trim().replace(/．/g, '.').replace(/\s+/g, ' ');
    const number = `(${TEXT_REF_NUMBER.replace(/．/g, '.')})`;
    const cjk = alias.match(new RegExp(`^(定理|引理|命题|推论|注|例)\\s*${number}$`));
    if (cjk) return `${cjk[1]}${normalizeReferenceNumber(cjk[2])}`;
    const cjkSectionPrefix = alias.match(new RegExp(`^第\\s*${number}\\s*节$`));
    if (cjkSectionPrefix) return `§${normalizeReferenceNumber(cjkSectionPrefix[1])}`;
    const cjkSectionName = alias.match(new RegExp(`^(?:节|小节|章节)\\s*${number}$`));
    if (cjkSectionName) return `§${normalizeReferenceNumber(cjkSectionName[1])}`;
    const cjkSectionSuffix = alias.match(new RegExp(`^${number}\\s*节$`));
    if (cjkSectionSuffix) return `§${normalizeReferenceNumber(cjkSectionSuffix[1])}`;
    const sectionSymbol = alias.match(new RegExp(`^§\\s*${number}$`));
    if (sectionSymbol) return `§${normalizeReferenceNumber(sectionSymbol[1])}`;
    return alias;
}

function makeTextReferencePattern(config) {
    const configuredTypes = ['prop', 'lemma', 'theorem', 'cor', 'section']
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
        'Remark',
        'Example',
        'Section',
        'Thm\\.',
        'Thm',
        'Lem\\.',
        'Lem',
        'Prop\\.',
        'Prop',
        'Cor\\.',
        'Cor',
        'Rem\\.',
        'Rem',
        'Ex\\.',
        'Ex',
        'Sec\\.',
        'Sec',
        ...configuredTypes.map(escapeRegExp)
    ]).join('|');
    const alternatives = [
        `(?:(?:${typeWords})\\s*(?:${TEXT_REF_NUMBER}))`,
        `(?:§\\s*(?:${TEXT_REF_NUMBER}))`,
        `(?:(?:${TEXT_REF_NUMBER})\\s*节)`,
        `(?:第\\s*(?:${TEXT_REF_NUMBER})\\s*节)`,
        `(?:(?:小节|章节)\\s*(?:${TEXT_REF_NUMBER}))`
    ].filter(Boolean).join('|');
    return new RegExp(`(^|[^@#A-Za-z0-9_])(${alternatives})(?![A-Za-z0-9_-]|\\.\\d)`, 'g');
}

function describeTextReference(alias, byAlias) {
    const defs = byAlias.get(normalizeTextReferenceAlias(alias)) || [];
    if (defs.length === 1) {
        const def = defs[0];
        return {
            status: 'resolved',
            id: def.id,
            title: def.title,
            display: displayLabel(def, { language: 'zh', dictionary: DEFAULT_CONFIG.dictionary })
        };
    }
    if (defs.length > 1) {
        return {
            status: 'ambiguous',
            candidates: defs.map(def => ({
                id: def.id,
                display: displayLabel(def, { language: 'zh', dictionary: DEFAULT_CONFIG.dictionary }),
                title: def.title,
                file: def.file,
                line: def.line
            }))
        };
    }
    return { status: 'unresolved' };
}

function splitProtectedInlineSegments(line) {
    const segments = [];
    const re = /(`[^`]*`|\[[^\]\n]+\]\([^\)\n]*\))/g;
    let lastIndex = 0;
    let match;
    while ((match = re.exec(line))) {
        if (match.index > lastIndex) {
            segments.push({ text: line.slice(lastIndex, match.index), kind: 'text' });
        }
        segments.push({
            text: match[0],
            kind: match[0].startsWith('`') ? 'code' : 'link'
        });
        lastIndex = re.lastIndex;
    }
    if (lastIndex < line.length) {
        segments.push({ text: line.slice(lastIndex), kind: 'text' });
    }
    return segments;
}

function collectLinkedTextReferences(segment, pattern, byAlias, file, lineNumber, linkedReferences, options: any = {}) {
    const match = segment.match(/^\[([^\]\n]+)\]\(([^\)\n]*)\)$/);
    if (!match) return;

    const label = match[1];
    pattern.lastIndex = 0;
    let refMatch;
    while ((refMatch = pattern.exec(label))) {
        const alias = refMatch[2];
        const description = describeTextReference(alias, byAlias);
        if (description.status === 'unresolved' && options.recordUnresolved === false) continue;
        linkedReferences.push({
            file,
            line: lineNumber,
            text: alias,
            link: segment,
            ...description
        });
    }
    pattern.lastIndex = 0;
}

function rewriteTextReferenceLine(line, pattern, byAlias, file, lineNumber, replacements, unresolved, ambiguous, linkedReferences, options: any = {}) {
    const parts = splitProtectedInlineSegments(line);
    let changed = false;

    const updated = parts.map(part => {
        if (part.kind === 'code') return part.text;
        if (part.kind === 'link') {
            collectLinkedTextReferences(part.text, pattern, byAlias, file, lineNumber, linkedReferences, options);
            return part.text;
        }

        return part.text.replace(pattern, (match, prefix, alias) => {
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
            } else if (options.recordUnresolved !== false) {
                unresolved.push(record);
            }
            return match;
        });
    }).join('');

    return { line: updated, changed };
}

function collectSectionHeadingAudit(line, file, lineNumber, sectionHeadings) {
    const match = line.match(/^(#{2,6})\s+(.+?)\s*$/);
    if (!match) return;

    const rawTitle = match[2].replace(/\s*\{#[^}]+\}\s*$/, '').trim();
    if (!rawTitle) return;
    if (/^#[A-Za-z0-9_-]+\b/.test(rawTitle)) return;

    sectionHeadings.push({
        file,
        line: lineNumber,
        level: match[1].length,
        title: rawTitle,
        text: line.trim()
    });
}

function rewriteTextReferences(content, file, pattern, byAlias, options: any = {}) {
    const lines = content.split(/\r?\n/);
    const eol = content.includes('\r\n') ? '\r\n' : '\n';
    const replacements = [];
    const unresolved = [];
    const ambiguous = [];
    const linkedReferences = [];
    const sectionHeadings = [];
    let inFence = false;
    let changed = false;

    const updatedLines = lines.map((line, index) => {
        if (/^\s*(```|~~~)/.test(line)) {
            inFence = !inFence;
            return line;
        }
        if (inFence) return line;

        if (options.auditStructure !== false) {
            collectSectionHeadingAudit(line, file, index + 1, sectionHeadings);
        }

        const result = rewriteTextReferenceLine(
            line,
            pattern,
            byAlias,
            file,
            index + 1,
            replacements,
            unresolved,
            ambiguous,
            linkedReferences,
            options
        );
        if (result.changed) changed = true;
        return result.line;
    });

    return {
        content: updatedLines.join(eol),
        changed,
        replacements,
        unresolved,
        ambiguous,
        linkedReferences,
        sectionHeadings
    };
}

function renderTextReferenceMigrationReport(result) {
    const lines = [
        '# Text Reference Migration',
        '',
        `Mode: ${result.apply ? 'apply' : 'dry-run'}`,
        `Reference scope: ${result.referenceScope}`,
        `Target files: ${result.definitionFiles}`,
        `Numbered entries in scope: ${result.definitionsInScope}`,
        `Files scanned: ${result.files}`,
        `Replacements: ${result.replacements.length}`,
        `Unresolved: ${result.unresolved.length}`,
        `Ambiguous: ${result.ambiguous.length}`,
        `Markdown links needing manual rewrite: ${result.linkedReferences.length}`,
        `Section headings needing numbered markers: ${result.sectionHeadings.length}`,
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

    if (result.linkedReferences.length > 0) {
        lines.push('## Markdown Links Needing Manual Rewrite', '');
        lines.push('Inline formal refs render as links already. Do not put `@h-...` inside an existing Markdown link label; replace the whole old link after checking the target.', '');
        result.linkedReferences.forEach(item => {
            const suffix = item.status === 'resolved' ? `; suggested @${item.id} (${item.title || item.display || 'untitled'})` : `; ${item.status}`;
            lines.push(`- ${item.file}:${item.line}: ${item.link} contains ${item.text}${suffix}`);
            if (item.candidates) {
                item.candidates.forEach(candidate => {
                    lines.push(`  - ${candidate.id} ${candidate.title || 'untitled'} (${candidate.file}:${candidate.line})`);
                });
            }
        });
        lines.push('');
    }

    if (result.sectionHeadings.length > 0) {
        lines.push('## Section Headings Needing Numbered Markers', '');
        lines.push('Plain Markdown headings are navigable as prose, but they are not stable numbered anchors. For referenced sections, write the heading as `## #tmp-* Title` and run `finish`.', '');
        result.sectionHeadings.forEach(item => {
            lines.push(`- ${item.file}:${item.line}: ${item.text}`);
        });
        lines.push('');
    }

    return `${lines.join('\n')}\n`;
}

async function migrateTextRefs(args) {
    const options = parseMigrationArgs(args);
    if (!options.all && options.paths.length === 0) {
        console.error('Usage: npm run formal -- migrate-text-refs <file-or-dir> [...] [--apply] [--target-only]');
        console.error('       npm run formal -- migrate-text-refs --all [--apply]');
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

    const allFiles = await collectMarkdownFiles();
    const targetFiles = options.all ? allFiles : await resolveInputMarkdownFiles(options.paths);
    const targetFileSet = new Set(targetFiles.map(relativePath));
    const targetDefinitions = options.all
        ? state.definitions
        : state.definitions.filter(def => targetFileSet.has(def.file));
    const targetNumberedEntries = targetDefinitions.filter(displayNumber);
    const targetByAlias = buildTextReferenceIndex(targetDefinitions, state.config);
    const rewriteFiles = migrationRewriteFiles(options, allFiles, targetFiles);
    const result = {
        apply: options.apply,
        referenceScope: migrationReferenceScope(options),
        definitionFiles: targetFiles.length,
        definitionsInScope: targetNumberedEntries.length,
        files: rewriteFiles.length,
        replacements: [],
        unresolved: [],
        ambiguous: [],
        linkedReferences: [],
        sectionHeadings: []
    };

    let changedFiles = 0;
    for (const fullPath of rewriteFiles) {
        const file = relativePath(fullPath);
        const original = await fs.readFile(fullPath, 'utf8');
        const isTargetFile = targetFileSet.has(file);
        const rewritten = rewriteTextReferences(
            original,
            file,
            pattern,
            isTargetFile ? byAlias : targetByAlias,
            isTargetFile
                ? {}
                : { recordUnresolved: false, auditStructure: false }
        );
        result.replacements.push(...rewritten.replacements);
        result.unresolved.push(...rewritten.unresolved);
        result.ambiguous.push(...rewritten.ambiguous);
        result.linkedReferences.push(...rewritten.linkedReferences);
        result.sectionHeadings.push(...rewritten.sectionHeadings);
        if (options.apply && rewritten.changed) {
            await fs.writeFile(fullPath, rewritten.content, 'utf8');
            changedFiles++;
        }
    }

    await ensureCacheDir();
    await fs.writeFile(path.join(CACHE_DIR, 'text-ref-migration.md'), renderTextReferenceMigrationReport(result), 'utf8');

    const mode = options.apply ? 'APPLY' : 'DRY-RUN';
    console.log(`${mode} migrate-text-refs: ${result.replacements.length} replacements, ${result.unresolved.length} unresolved, ${result.ambiguous.length} ambiguous`);
    console.log(`Scope: ${result.referenceScope}.`);
    console.log(`Manual review: ${result.linkedReferences.length} markdown links, ${result.sectionHeadings.length} section headings`);
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

function makeDummyHash(chapter, index) {
    return `h-${chapter.toString(16).padStart(4, '0')}${index.toString(16).padStart(12, '0')}`;
}

function makeDummyDocuments(chapters, blocksPerChapter) {
    const documents = [];
    for (let chapter = 1; chapter <= chapters; chapter++) {
        const lines = [`# Dummy Chapter ${chapter}`, ''];
        for (let index = 1; index <= blocksPerChapter; index++) {
            const id = makeDummyHash(chapter, index);
            const previous = index > 1 ? ` By @${makeDummyHash(chapter, index - 1)} we continue.` : '';
            lines.push(`定理 #${id}（Dummy ${chapter}.${index}）：This is a generated theorem for scanner performance.${previous}`);
            lines.push('');
        }
        documents.push({
            filePath: `perf/book1/${String(chapter).padStart(2, '0')}-dummy.md`,
            content: lines.join('\n')
        });
    }
    return documents;
}

async function perfDummy(args) {
    const options = parsePerfArgs(args);
    const chapters = Math.max(1, Number(options.positionals[0] || 50));
    const blocksPerChapter = Math.max(1, Number(options.positionals[1] || 200));
    const documents = makeDummyDocuments(chapters, blocksPerChapter);
    const started = Date.now();
    const state = scanFormalDocuments(documents, mergeConfig(DEFAULT_CONFIG));
    const elapsed = Date.now() - started;
    const memory = process.memoryUsage ? process.memoryUsage() : undefined;
    const heapMbValue = memory ? memory.heapUsed / 1024 / 1024 : undefined;
    const heapMb = heapMbValue === undefined ? 'n/a' : Math.round(heapMbValue);
    printSummary('perf-dummy', state);
    console.log(`Documents: ${chapters}, blocks/document: ${blocksPerChapter}, total blocks: ${chapters * blocksPerChapter}`);
    console.log(`Elapsed: ${elapsed}ms, heap used: ${heapMb}MB`);
    if (state.issues.some(issue => issue.severity === 'error')) process.exitCode = 1;
    if (options.maxMs !== undefined && elapsed > options.maxMs) {
        console.error(`PERF failed: elapsed ${elapsed}ms exceeds --max-ms ${options.maxMs}`);
        process.exitCode = 1;
    }
    if (options.maxHeapMb !== undefined && heapMbValue !== undefined && heapMbValue > options.maxHeapMb) {
        console.error(`PERF failed: heap ${Math.round(heapMbValue)}MB exceeds --max-heap-mb ${options.maxHeapMb}`);
        process.exitCode = 1;
    }
}

function parsePerfArgs(args) {
    const options = {
        positionals: [],
        maxMs: undefined,
        maxHeapMb: undefined
    };
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--max-ms') {
            options.maxMs = Number(args[++i]);
        } else if (arg.startsWith('--max-ms=')) {
            options.maxMs = Number(arg.slice('--max-ms='.length));
        } else if (arg === '--max-heap-mb') {
            options.maxHeapMb = Number(args[++i]);
        } else if (arg.startsWith('--max-heap-mb=')) {
            options.maxHeapMb = Number(arg.slice('--max-heap-mb='.length));
        } else {
            options.positionals.push(arg);
        }
    }
    return options;
}

function printHelp({ all = false } = {}) {
    if (!all) {
        console.log(`Usage:
  npm run formal -- prepare
  npm run formal -- finish <file-or-dir> [...] [--all]
  npm run formal -- migrate-text-refs <file-or-dir> [...] [--apply] [--target-only] [--all]
  npm run formal -- migrate-ids <file-or-dir> [...] [--apply] [--target-only] [--all]
  npm run formal -- verify [--strict-chapters]

Migrations are dry-run by default. Pass --apply to edit files.

Agent workflow:
  1. Run prepare.
  2. Read .markdown-formal/agent-guide.md and .markdown-formal/reference-map.md.
  3. Use tmp-* for new objects, then run finish on the edited file or directory.
  4. For old numbered prose, migrate-text-refs <scope> updates target files plus incoming references by default.
  5. If you use finalize directly, run verify before treating generated or migrated content as complete.

Advanced commands:
  npm run formal -- help --all`);
        return;
    }

    console.log(`Usage:
  npm run formal -- prepare
  npm run formal -- finish <file-or-dir> [...] [--all]
  npm run formal -- migrate-text-refs <file-or-dir> [...] [--apply] [--target-only] [--all]
  npm run formal -- migrate-ids <file-or-dir> [...] [--apply] [--target-only] [--all]
  npm run formal -- verify [--strict-chapters]

Advanced:
  npm run formal -- finalize <file-or-dir> [...] [--all]
  npm run formal -- lint
  npm run formal -- perf-dummy [chapters] [blocks-per-chapter] [--max-ms N] [--max-heap-mb N]
  npm run formal -- report

Migrations are dry-run by default. Pass --apply to edit files.

Agent workflow:
  1. Run prepare.
  2. Read .markdown-formal/agent-guide.md and .markdown-formal/reference-map.md.
  3. Use tmp-* for new objects, then run finish on the edited file or directory.
  4. For old numbered prose, migrate-text-refs <scope> updates target files plus incoming references by default.
  5. If you use finalize directly, run verify before treating generated or migrated content as complete.`);
}

async function main() {
    const [command, ...args] = process.argv.slice(2);

    if (!command || command === 'help' || command === '--help') {
        printHelp({ all: args.includes('--all') });
    } else if (command === 'prepare' || command === 'doctor') {
        await prepare({ exitOnError: true });
    } else if (command === 'lint') {
        await lint();
    } else if (command === 'verify') {
        await verify(args);
    } else if (command === 'finalize') {
        await finalize(args);
    } else if (command === 'finish') {
        await finish(args);
    } else if (command === 'migrate-text-refs') {
        await migrateTextRefs(args);
    } else if (command === 'migrate-ids') {
        await migrateIds(args);
    } else if (command === 'report') {
        await printReport();
    } else if (command === 'perf-dummy') {
        await perfDummy(args);
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
