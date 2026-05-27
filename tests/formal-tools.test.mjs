import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(repoRoot, 'out', 'cli', 'formal-tools.js');

async function makeWorkspace(name) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), `markdown-formal-${name}-`));
    await fs.mkdir(path.join(root, 'book1'), { recursive: true });
    return root;
}

function runCli(cwd, args) {
    return spawnSync('node', [cliPath, ...args], {
        cwd,
        encoding: 'utf8'
    });
}

function combinedOutput(result) {
    return `${result.stdout}\n${result.stderr}`;
}

async function read(root, filePath) {
    return fs.readFile(path.join(root, filePath), 'utf8');
}

async function testFinalizeCrossFileSafety() {
    const root = await makeWorkspace('finalize');
    await fs.writeFile(path.join(root, 'book1', '01-a.md'), [
        '# Chapter 1',
        '',
        '定理 #tmp-1（Tmp Main）：A.',
        '',
        'Local @tmp-1.',
        'Inline code `@tmp-1 #tmp-1` must stay unchanged.',
        '```',
        'Fenced @tmp-1 #tmp-1 must stay unchanged.',
        '```',
        ''
    ].join('\n'));
    await fs.writeFile(path.join(root, 'book1', '02-b.md'), [
        '# Chapter 2',
        '',
        'Cross @tmp-1.',
        ''
    ].join('\n'));

    const scoped = runCli(root, ['finalize', 'book1/01-a.md']);
    assert.notEqual(scoped.status, 0, combinedOutput(scoped));
    assert.match(combinedOutput(scoped), /cross-file temporary references/);
    assert.match(await read(root, 'book1/01-a.md'), /定理 #tmp-1/);
    assert.match(await read(root, 'book1/02-b.md'), /@tmp-1/);

    const all = runCli(root, ['finalize', 'book1/01-a.md', '--all']);
    assert.equal(all.status, 0, combinedOutput(all));
    const chapter1 = await read(root, 'book1/01-a.md');
    const chapter2 = await read(root, 'book1/02-b.md');
    assert.doesNotMatch(chapter1, /定理 #tmp-1/);
    assert.doesNotMatch(chapter1, /Local @tmp-1\./);
    assert.doesNotMatch(chapter2, /tmp-1/);
    assert.match(chapter1, /#h-[a-f0-9]{16}/);
    assert.match(chapter2, /@h-[a-f0-9]{16}/);
    assert.match(chapter1, /`@tmp-1 #tmp-1`/);
    assert.match(chapter1, /Fenced @tmp-1 #tmp-1 must stay unchanged\./);
}

async function testFinishFinalizesAndVerifies() {
    const root = await makeWorkspace('finish');
    await fs.writeFile(path.join(root, 'book1', '01-a.md'), [
        '# Chapter 1',
        '',
        '定理 #tmp-1（Tmp Main）：A.',
        '',
        'Local @tmp-1.',
        ''
    ].join('\n'));

    const finish = runCli(root, ['finish', 'book1/01-a.md']);
    assert.equal(finish.status, 0, combinedOutput(finish));
    assert.match(combinedOutput(finish), /OK verify: generated\/ migrated content gate passed/);
    const chapter = await read(root, 'book1/01-a.md');
    assert.doesNotMatch(chapter, /tmp-1/);
    assert.match(chapter, /#h-[a-f0-9]{16}/);
    assert.match(chapter, /@h-[a-f0-9]{16}/);
}

async function testMigrateIdsScopedSafety() {
    const root = await makeWorkspace('migrate-ids');
    await fs.writeFile(path.join(root, 'book1', '01-a.md'), [
        '# Chapter 1',
        '',
        '定理 #old-main（Old Main）：A.',
        '',
        'Local @old-main.',
        '',
        '定义（旧术语）：Definitions are lookup-only and have no IDs.',
        'Inline code `@old-main #old-main` must stay unchanged.',
        '```',
        'Fenced @old-main #old-main must stay unchanged.',
        '```',
        ''
    ].join('\n'));
    await fs.writeFile(path.join(root, 'book1', '02-b.md'), [
        '# Chapter 2',
        '',
        'Cross @old-main.',
        'Code `@old-main` must stay unchanged.',
        '',
        '引理 #outside-old（Outside）：B.',
        ''
    ].join('\n'));

    const targetOnly = runCli(root, ['migrate-ids', '--apply', '--target-only', 'book1/01-a.md']);
    assert.notEqual(targetOnly.status, 0, combinedOutput(targetOnly));
    assert.match(combinedOutput(targetOnly), /Refusing to apply/);
    assert.match(await read(root, 'book1/01-a.md'), /定理 #old-main/);
    assert.match(await read(root, 'book1/02-b.md'), /@old-main/);

    const scoped = runCli(root, ['migrate-ids', '--apply', 'book1/01-a.md']);
    assert.equal(scoped.status, 0, combinedOutput(scoped));
    assert.match(combinedOutput(scoped), /Incoming references outside target scope will be updated: 1/);
    const chapter1 = await read(root, 'book1/01-a.md');
    const chapter2 = await read(root, 'book1/02-b.md');
    assert.doesNotMatch(chapter1, /定理 #old-main/);
    assert.doesNotMatch(chapter1, /Local @old-main\./);
    assert.doesNotMatch(chapter2, /Cross @old-main\./);
    assert.match(chapter1, /定义（旧术语）：Definitions are lookup-only and have no IDs\./);
    assert.match(chapter1, /#h-[a-f0-9]{16}/);
    assert.match(chapter2, /@h-[a-f0-9]{16}/);
    assert.match(chapter2, /#outside-old/);
    assert.match(chapter1, /`@old-main #old-main`/);
    assert.match(chapter1, /Fenced @old-main #old-main must stay unchanged\./);
    assert.match(chapter2, /`@old-main`/);
}

async function testMigrateTextRefsReport() {
    const root = await makeWorkspace('text-refs');
    await fs.writeFile(path.join(root, 'book1', '01-a.md'), [
        '# Chapter 1',
        '',
        '定理 #h-1111111111111111（Base）：Base statement.',
        '',
        '由 定理 1.1 和 Theorem 1.1 可得结论。',
        'Inline code `定理 1.1` must stay unchanged.',
        '```',
        'Fenced 定理 1.1 must stay unchanged.',
        '```',
        'Unresolved 定理 9.9 stays textual.',
        ''
    ].join('\n'));

    const apply = runCli(root, ['migrate-text-refs', '--apply', 'book1/01-a.md']);
    assert.equal(apply.status, 0, combinedOutput(apply));
    const chapter = await read(root, 'book1/01-a.md');
    assert.match(chapter, /由 @h-1111111111111111 和 @h-1111111111111111 可得结论。/);
    assert.match(chapter, /`定理 1\.1`/);
    assert.match(chapter, /Fenced 定理 1\.1 must stay unchanged\./);
    assert.match(chapter, /Unresolved 定理 9\.9 stays textual\./);

    const report = await read(root, '.markdown-formal/text-ref-migration.md');
    assert.match(report, /Replacements: 2/);
    assert.match(report, /Unresolved: 1/);
    assert.match(report, /book1\/01-a\.md:10: 定理 9\.9/);

    const verify = runCli(root, ['verify']);
    assert.notEqual(verify.status, 0, combinedOutput(verify));
    assert.match(combinedOutput(verify), /text-reference migration has unresolved=1, ambiguous=0/);
}

async function testCustomDictionaryTextRefs() {
    const root = await makeWorkspace('custom-dictionary');
    await fs.mkdir(path.join(root, '.markdown-formal'), { recursive: true });
    await fs.writeFile(path.join(root, '.markdown-formal', 'config.json'), JSON.stringify({
        language: 'en',
        dictionary: {
            en: {
                theorem: 'Satz'
            }
        }
    }, null, 2));
    await fs.writeFile(path.join(root, 'book1', '01-a.md'), [
        '# Chapter 1',
        '',
        'Theorem #h-2222222222222222 (Base): Base statement.',
        '',
        'Definition (Spectrum): A definition body.',
        '',
        'By Satz 1.1 we conclude.',
        ''
    ].join('\n'));

    const apply = runCli(root, ['migrate-text-refs', '--apply', 'book1/01-a.md']);
    assert.equal(apply.status, 0, combinedOutput(apply));
    const chapter = await read(root, 'book1/01-a.md');
    assert.match(chapter, /By @h-2222222222222222 we conclude\./);

    const previewCache = JSON.parse(await read(root, '.markdown-formal/preview-cache.json'));
    assert.equal(previewCache.entries['h-2222222222222222'].content, 'Theorem (Base): Base statement.');
    assert.equal(previewCache.definitions[0].title, 'Spectrum');
    assert.equal(previewCache.definitions[0].filePath, 'book1/01-a.md');
    assert.equal(previewCache.definitions[0].line, 5);
    assert.equal(previewCache.definitions[0].content, 'Definition (Spectrum): A definition body.');
    await assert.rejects(read(root, '.markdown-formal/definition-index.md'), /ENOENT/);
}

async function testSymbolCache() {
    const root = await makeWorkspace('symbols');
    await fs.writeFile(path.join(root, 'formal-symbols.json'), JSON.stringify([
        {
            pattern: '\\sigma(${operator})',
            meaning: 'Spectrum of the captured operator.',
            scope: 'book',
            source: 'book1/01-a.md:3'
        },
        {
            pattern: '\\lambda',
            meaning: 'A local spectral parameter.',
            scope: 'file',
            source: 'book1/01-a.md:3'
        }
    ], null, 2));
    await fs.writeFile(path.join(root, 'book1', '01-a.md'), [
        '# Chapter 1',
        '',
        '定义（算子谱）：The spectrum $\\sigma(T)$ contains values $\\lambda$.',
        ''
    ].join('\n'));

    const prepare = runCli(root, ['prepare']);
    assert.equal(prepare.status, 0, combinedOutput(prepare));
    const previewCache = JSON.parse(await read(root, '.markdown-formal/preview-cache.json'));
    assert.equal(previewCache.symbols.length, 2);
    assert.equal(previewCache.symbols[0].display, '$\\sigma(T)$');
    assert.equal(previewCache.symbols[1].display, '$\\lambda$');
    assert.equal(previewCache.symbols[0].regex, '^\\\\sigma\\((.+?)\\)$');
    assert.deepEqual(previewCache.symbols[0].captures, ['operator']);
    assert.equal(previewCache.symbols[0].sourceFilePath, 'book1/01-a.md');
    assert.equal(previewCache.symbols[0].sourceLine, 3);
}

async function testMigrateTextRefsSectionsAndAudits() {
    const root = await makeWorkspace('text-refs-audit');
    await fs.writeFile(path.join(root, 'book1', '01-a.md'), [
        '# Chapter 1',
        '',
        '## #h-3333333333333333 背景',
        '',
        'Background.',
        '',
        '定理 #h-4444444444444444（Base）：Base statement.',
        '',
        '定义（谱）：A definition body.',
        '',
        '见第 1.1 节、§1.1 和 1.1 节。',
        '链接 [定理 1.1](old.md#thm) 需要人工处理。',
        '根据谱定义可得。',
        '## 1.2 旧小节标题',
        ''
    ].join('\n'));

    const apply = runCli(root, ['migrate-text-refs', '--apply', 'book1/01-a.md']);
    assert.equal(apply.status, 0, combinedOutput(apply));
    const chapter = await read(root, 'book1/01-a.md');
    assert.match(chapter, /见@h-3333333333333333、@h-3333333333333333 和 @h-3333333333333333。/);
    assert.match(chapter, /链接 \[定理 1\.1\]\(old\.md#thm\) 需要人工处理。/);
    assert.match(chapter, /根据谱定义可得。/);

    const report = await read(root, '.markdown-formal/text-ref-migration.md');
    assert.match(report, /Replacements: 3/);
    assert.match(report, /Markdown links needing manual rewrite: 1/);
    assert.match(report, /Section headings needing numbered markers: 1/);
    assert.match(report, /\[定理 1\.1\]\(old\.md#thm\).*suggested @h-4444444444444444/);
    assert.match(report, /book1\/01-a\.md:14: ## 1\.2 旧小节标题/);
}

async function testMigrateTextRefsUpdatesIncomingByDefault() {
    const root = await makeWorkspace('text-refs-incoming');
    await fs.writeFile(path.join(root, 'book1', '01-a.md'), [
        '# Chapter 1',
        '',
        '定理 #h-aaaaaaaaaaaaaaaa（Target）：Target statement.',
        '',
        'Target chapter outgoing 定理 2.1.',
        ''
    ].join('\n'));
    await fs.writeFile(path.join(root, 'book1', '02-b.md'), [
        '# Chapter 2',
        '',
        '定理 #h-bbbbbbbbbbbbbbbb（Outside）：Outside statement.',
        '',
        'Incoming 定理 1.1 should update.',
        'Unrelated 定理 2.1 should stay for later migration.',
        'Link [定理 1.1](old.md#target) should be reported.',
        'Other link [定理 2.1](old.md#outside) should not be reported.',
        ''
    ].join('\n'));

    const apply = runCli(root, ['migrate-text-refs', '--apply', 'book1/01-a.md']);
    assert.equal(apply.status, 0, combinedOutput(apply));
    const chapter1 = await read(root, 'book1/01-a.md');
    const chapter2 = await read(root, 'book1/02-b.md');
    assert.match(chapter1, /Target chapter outgoing @h-bbbbbbbbbbbbbbbb\./);
    assert.match(chapter2, /Incoming @h-aaaaaaaaaaaaaaaa should update\./);
    assert.match(chapter2, /Unrelated 定理 2\.1 should stay for later migration\./);
    assert.match(chapter2, /Link \[定理 1\.1\]\(old\.md#target\) should be reported\./);
    assert.match(chapter2, /Other link \[定理 2\.1\]\(old\.md#outside\) should not be reported\./);

    const report = await read(root, '.markdown-formal/text-ref-migration.md');
    assert.match(report, /Reference scope: target files plus incoming refs across all files/);
    assert.match(report, /Replacements: 2/);
    assert.match(report, /Unresolved: 0/);
    assert.match(report, /Markdown links needing manual rewrite: 1/);
    assert.match(report, /\[定理 1\.1\]\(old\.md#target\).*suggested @h-aaaaaaaaaaaaaaaa/);
    assert.doesNotMatch(report, /old\.md#outside/);
}

async function testVerifyRejectsNonHashIds() {
    const root = await makeWorkspace('verify');
    await fs.writeFile(path.join(root, 'book1', '01-a.md'), [
        '# Chapter 1',
        '',
        '定理 #semantic-id（Semantic）：Statement.',
        ''
    ].join('\n'));

    const verify = runCli(root, ['verify']);
    assert.notEqual(verify.status, 0, combinedOutput(verify));
    assert.match(combinedOutput(verify), /non-hash-id/);
}

async function testPerfDummyThresholds() {
    const root = await makeWorkspace('perf');
    const pass = runCli(root, ['perf-dummy', '2', '5', '--max-ms', '10000', '--max-heap-mb', '512']);
    assert.equal(pass.status, 0, combinedOutput(pass));

    const fail = runCli(root, ['perf-dummy', '2', '5', '--max-heap-mb', '0']);
    assert.notEqual(fail.status, 0, combinedOutput(fail));
    assert.match(combinedOutput(fail), /PERF failed: heap/);
}

const tests = [
    ['finalize cross-file safety', testFinalizeCrossFileSafety],
    ['finish finalizes and verifies', testFinishFinalizesAndVerifies],
    ['migrate-ids scoped safety', testMigrateIdsScopedSafety],
    ['migrate-text-refs report', testMigrateTextRefsReport],
    ['custom dictionary text refs', testCustomDictionaryTextRefs],
    ['symbol cache', testSymbolCache],
    ['migrate-text-refs sections and audits', testMigrateTextRefsSectionsAndAudits],
    ['migrate-text-refs updates incoming refs by default', testMigrateTextRefsUpdatesIncomingByDefault],
    ['verify rejects non-hash ids', testVerifyRejectsNonHashIds],
    ['perf-dummy thresholds', testPerfDummyThresholds]
];

for (const [name, test] of tests) {
    await test();
    console.log(`ok - ${name}`);
}
