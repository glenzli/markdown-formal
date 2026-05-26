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
        ':::theorem {#tmp-1 title="Tmp Main"}',
        'A.',
        ':::',
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
    assert.match(await read(root, 'book1/01-a.md'), /#tmp-1/);
    assert.match(await read(root, 'book1/02-b.md'), /@tmp-1/);

    const all = runCli(root, ['finalize', 'book1/01-a.md', '--all']);
    assert.equal(all.status, 0, combinedOutput(all));
    const chapter1 = await read(root, 'book1/01-a.md');
    const chapter2 = await read(root, 'book1/02-b.md');
    assert.doesNotMatch(chapter1, /:::theorem \{#tmp-1/);
    assert.doesNotMatch(chapter1, /Local @tmp-1\./);
    assert.doesNotMatch(chapter2, /tmp-1/);
    assert.match(chapter1, /#h-[a-f0-9]{16}/);
    assert.match(chapter2, /@h-[a-f0-9]{16}/);
    assert.match(chapter1, /`@tmp-1 #tmp-1`/);
    assert.match(chapter1, /Fenced @tmp-1 #tmp-1 must stay unchanged\./);
}

async function testMigrateIdsScopedSafety() {
    const root = await makeWorkspace('migrate-ids');
    await fs.writeFile(path.join(root, 'book1', '01-a.md'), [
        '# Chapter 1',
        '',
        ':::theorem {#old-main title="Old Main"}',
        'A.',
        ':::',
        '',
        'Local @old-main.',
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
        ':::lemma {#outside-old title="Outside"}',
        'B.',
        ':::',
        ''
    ].join('\n'));

    const scoped = runCli(root, ['migrate-ids', '--apply', 'book1/01-a.md']);
    assert.notEqual(scoped.status, 0, combinedOutput(scoped));
    assert.match(combinedOutput(scoped), /Refusing to apply/);
    assert.match(await read(root, 'book1/01-a.md'), /#old-main/);
    assert.match(await read(root, 'book1/02-b.md'), /@old-main/);

    const updateRefs = runCli(root, ['migrate-ids', '--apply', '--update-refs-all', 'book1/01-a.md']);
    assert.equal(updateRefs.status, 0, combinedOutput(updateRefs));
    const chapter1 = await read(root, 'book1/01-a.md');
    const chapter2 = await read(root, 'book1/02-b.md');
    assert.doesNotMatch(chapter1, /:::theorem \{#old-main/);
    assert.doesNotMatch(chapter1, /Local @old-main\./);
    assert.doesNotMatch(chapter2, /Cross @old-main\./);
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
        ':::theorem {#h-1111111111111111 title="Base"}',
        'Base statement.',
        ':::',
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
    assert.match(report, /book1\/01-a\.md:12: 定理 9\.9/);

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
        ':::theorem {#h-2222222222222222 title="Base"}',
        'Base statement.',
        ':::',
        '',
        'By Satz 1.1 we conclude.',
        ''
    ].join('\n'));

    const apply = runCli(root, ['migrate-text-refs', '--apply', 'book1/01-a.md']);
    assert.equal(apply.status, 0, combinedOutput(apply));
    const chapter = await read(root, 'book1/01-a.md');
    assert.match(chapter, /By @h-2222222222222222 we conclude\./);
}

async function testVerifyRejectsNonHashIds() {
    const root = await makeWorkspace('verify');
    await fs.writeFile(path.join(root, 'book1', '01-a.md'), [
        '# Chapter 1',
        '',
        ':::theorem {#semantic-id title="Semantic"}',
        'Statement.',
        ':::',
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
    ['migrate-ids scoped safety', testMigrateIdsScopedSafety],
    ['migrate-text-refs report', testMigrateTextRefsReport],
    ['custom dictionary text refs', testCustomDictionaryTextRefs],
    ['verify rejects non-hash ids', testVerifyRejectsNonHashIds],
    ['perf-dummy thresholds', testPerfDummyThresholds]
];

for (const [name, test] of tests) {
    await test();
    console.log(`ok - ${name}`);
}
