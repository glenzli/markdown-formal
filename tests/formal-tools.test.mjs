import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(repoRoot, 'out', 'cli', 'formal-tools.js');
const require = createRequire(import.meta.url);

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
    await fs.writeFile(path.join(root, '.markdown-formal/definitions.json'), JSON.stringify([
        {
            term: '非标准定义',
            aliases: ['别名定义'],
            source: 'book1/01-a.md:17',
            content: '我们把满足谱约束且闭合于极限的对象称为“非标准定义”，后续只通过定义搜索查询它。'
        }
    ], null, 2));
    await fs.writeFile(path.join(root, 'book1', '01-a.md'), [
        '# Chapter 1',
        '',
        'Theorem #h-2222222222222222 (Base): Base statement.',
        '',
        'Definition (Spectrum): A definition body.',
        '',
        '**定义（加粗术语）：** 中文定义正文。',
        '',
        '定义（指标密度）：指标密度由下式给出',
        '',
        '$$',
        '\\alpha(D)=\\widehat{A}(TX)\\operatorname{ch}(\\sigma(D))',
        '$$',
        '',
        '其中 $D$ 是局部椭圆算子。',
        '',
        '我们把满足谱约束且闭合于极限的对象称为“非标准定义”，后续只通过定义搜索查询它。',
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
    assert.equal(previewCache.definitions[1].title, '加粗术语');
    assert.equal(previewCache.definitions[1].line, 7);
    assert.equal(previewCache.definitions[1].content, '**定义（加粗术语）：** 中文定义正文。');
    assert.equal(previewCache.definitions[2].title, '指标密度');
    assert.equal(previewCache.definitions[2].line, 9);
    assert.match(previewCache.definitions[2].content, /\\alpha\(D\)=/);
    assert.match(previewCache.definitions[2].content, /其中 \$D\$ 是局部椭圆算子。/);
    assert.equal(previewCache.definitions[3].title, '非标准定义');
    assert.deepEqual(previewCache.definitions[3].aliases, ['别名定义']);
    assert.equal(previewCache.definitions[3].line, 17);
    assert.match(previewCache.definitions[3].content, /称为“非标准定义”/);
    await assert.rejects(read(root, '.markdown-formal/definition-index.md'), /ENOENT/);
}

async function testSymbolCache() {
    const root = await makeWorkspace('symbols');
    await fs.mkdir(path.join(root, '.markdown-formal'), { recursive: true });
    await fs.writeFile(path.join(root, '.markdown-formal', 'symbols.json'), JSON.stringify([
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

async function testWarnsUnbalancedSymbolPattern() {
    const root = await makeWorkspace('symbol-pattern-warning');
    await fs.mkdir(path.join(root, '.markdown-formal'), { recursive: true });
    await fs.writeFile(path.join(root, '.markdown-formal', 'symbols.json'), JSON.stringify([
        {
            pattern: '\\mathcal{N}_{${index}}\\bigl(${mesh},\\,${base}',
            meaning: 'An intentionally incomplete notation pattern.',
            scope: 'book',
            source: 'book1/01-a.md:3'
        }
    ], null, 2));
    await fs.writeFile(path.join(root, 'book1', '01-a.md'), [
        '# Chapter 1',
        '',
        '定义（覆盖数）：The symbol is introduced here.',
        ''
    ].join('\n'));

    const verify = runCli(root, ['verify']);
    assert.equal(verify.status, 0, combinedOutput(verify));
    assert.match(combinedOutput(verify), /symbol-pattern-unbalanced-delimiter/);
}

async function testRecallBoundariesAndOptionalBlocks() {
    const root = await makeWorkspace('recall-boundaries');
    await fs.writeFile(path.join(root, 'book1', '01-a.md'), [
        '# Chapter 1',
        '',
        '## #h-1111111111111111 Boundary Section',
        '',
        'Theorem #h-2222222222222222 (Boundary): First line of the statement.',
        'Second statement line with $x$.',
        '',
        'Proof.',
        'The proof body should not enter recall preview.',
        '',
        'Remark #h-3333333333333333 (Important): This remark is explicitly indexed.',
        'It has a second line.',
        '',
        'Theorem #h-4444444444444444 (After remark): The theorem counter should ignore remark numbering.',
        '',
        'Example #h-5555555555555555 (Model): A referenced example.',
        '',
        '命题 #h-6666666666666666（有效分量包含律）：**(i)** 对于复合算子 $\\phi_2 \\circ \\phi_1 \\in \\Omega$，有效分量满足包含关系。',
        '',
        '命题 #h-7777777777777777 **（加粗标题）：** 允许标题括号本身加粗。',
        '',
        'Later text cites @h-3333333333333333 and @h-5555555555555555.',
        ''
    ].join('\n'));

    const prepare = runCli(root, ['prepare']);
    assert.equal(prepare.status, 0, combinedOutput(prepare));
    const previewCache = JSON.parse(await read(root, '.markdown-formal/preview-cache.json'));

    assert.equal(previewCache.entries['h-1111111111111111'].content, undefined);
    assert.equal(previewCache.entries['h-2222222222222222'].content, [
        'Theorem (Boundary): First line of the statement.',
        'Second statement line with $x$.'
    ].join('\n'));
    assert.doesNotMatch(previewCache.entries['h-2222222222222222'].content, /proof body/i);
    assert.match(previewCache.entries['h-3333333333333333'].content, /second line/);
    assert.equal(previewCache.entries['h-2222222222222222'].number, 1);
    assert.equal(previewCache.entries['h-4444444444444444'].number, 2);
    assert.equal(previewCache.entries['h-6666666666666666'].title, '有效分量包含律');
    assert.equal(previewCache.entries['h-7777777777777777'].title, '加粗标题');
    assert.equal(previewCache.entries['h-3333333333333333'].number, 1);
    assert.equal(previewCache.entries['h-5555555555555555'].number, 1);

    const referenceMap = await read(root, '.markdown-formal/reference-map.md');
    assert.match(referenceMap, /注 1\.1/);
    assert.match(referenceMap, /例 1\.1/);
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

async function testVerifyRejectsMissingDefinitionContent() {
    const root = await makeWorkspace('definition-content');
    await fs.mkdir(path.join(root, '.markdown-formal'), { recursive: true });
    await fs.writeFile(path.join(root, '.markdown-formal', 'definitions.json'), JSON.stringify([
        {
            term: 'Indexed Concept',
            source: 'book1/01-a.md:3'
        }
    ], null, 2));
    await fs.writeFile(path.join(root, 'book1', '01-a.md'), [
        '# Chapter 1',
        '',
        'We call this object an Indexed Concept.',
        ''
    ].join('\n'));

    const verify = runCli(root, ['verify']);
    assert.notEqual(verify.status, 0, combinedOutput(verify));
    assert.match(combinedOutput(verify), /definition-content-missing/);
}

async function testScanExcludeAndZeroIntroductionPages() {
    const root = await makeWorkspace('scan-exclude');
    await fs.mkdir(path.join(root, '.markdown-formal'), { recursive: true });
    await fs.writeFile(path.join(root, '.markdown-formal', 'config.json'), JSON.stringify({
        scan: {
            exclude: [
                'draft/**',
                '.context/**',
                'formal-oet/.lake/**'
            ]
        }
    }, null, 2));
    await fs.mkdir(path.join(root, 'book1', 'vol-1'), { recursive: true });
    await fs.mkdir(path.join(root, 'book1', 'vol-2'), { recursive: true });
    await fs.mkdir(path.join(root, 'draft'), { recursive: true });
    await fs.mkdir(path.join(root, '.context'), { recursive: true });
    await fs.mkdir(path.join(root, 'formal-oet', '.lake'), { recursive: true });

    await fs.writeFile(path.join(root, 'book1', 'vol-1', '00-introduction.md'), [
        '# 第一卷导读',
        '',
        'This page should be an intro, not chapter 0.',
        ''
    ].join('\n'));
    await fs.writeFile(path.join(root, 'book1', 'vol-1', '01-main.md'), [
        '# Chapter 1',
        '',
        '定理 #h-1111111111111111（Main）：Statement.',
        ''
    ].join('\n'));
    await fs.writeFile(path.join(root, 'book1', 'vol-2', '00-introduction.md'), [
        '# 第二卷导读',
        '',
        'This second intro should not duplicate chapter 0.',
        ''
    ].join('\n'));
    await fs.writeFile(path.join(root, 'book1', 'vol-2', '02-next.md'), [
        '# Chapter 2',
        '',
        '定理 #h-2222222222222222（Next）：Statement.',
        ''
    ].join('\n'));
    await fs.writeFile(path.join(root, 'draft', '01-bad.md'), '定理 #semantic-draft（Bad）：Should be excluded.\n');
    await fs.writeFile(path.join(root, '.context', '01-bad.md'), '定理 #semantic-context（Bad）：Should be excluded.\n');
    await fs.writeFile(path.join(root, 'formal-oet', '.lake', '01-bad.md'), '定理 #semantic-lake（Bad）：Should be excluded.\n');

    const verify = runCli(root, ['verify']);
    assert.equal(verify.status, 0, combinedOutput(verify));
    const previewCache = JSON.parse(await read(root, '.markdown-formal/preview-cache.json'));
    assert.equal(previewCache.pages.filter(page => page.kind === 'intro').length, 2);
    assert.equal(previewCache.pages.filter(page => page.kind === 'chapter' && page.chapter === 0).length, 0);
    assert.equal(previewCache.pages.some(page => page.filePath.startsWith('draft/')), false);
    assert.equal(previewCache.pages.some(page => page.filePath.startsWith('.context/')), false);
    assert.equal(previewCache.pages.some(page => page.filePath.startsWith('formal-oet/.lake/')), false);
}

async function testPageTitleUsesUniqueHighestHeading() {
    const root = await makeWorkspace('page-title');
    await fs.writeFile(path.join(root, 'book1', '01-lowered.md'), [
        '## Lowered Chapter Title',
        '',
        '### Local Section',
        '',
        '定理 #h-1111111111111111（Main）：Statement.',
        ''
    ].join('\n'));
    await fs.writeFile(path.join(root, 'book1', '02-formal-only.md'), [
        '## #h-2222222222222222 Stable Section',
        '',
        'Content.',
        '',
        '## #h-3333333333333333 Another Stable Section',
        '',
        'Content.',
        ''
    ].join('\n'));
    await fs.writeFile(path.join(root, 'book1', '03-ambiguous.md'), [
        '# First Candidate',
        '',
        '# Second Candidate',
        '',
        '定理 #h-4444444444444444（Ambiguous）：Statement.',
        ''
    ].join('\n'));

    const prepare = runCli(root, ['prepare']);
    assert.equal(prepare.status, 0, combinedOutput(prepare));
    const previewCache = JSON.parse(await read(root, '.markdown-formal/preview-cache.json'));
    const titleFor = filePath => previewCache.pages.find(page => page.filePath === filePath)?.title;

    assert.equal(titleFor('book1/01-lowered.md'), 'Lowered Chapter Title');
    assert.equal(titleFor('book1/02-formal-only.md'), 'formal only');
    assert.equal(titleFor('book1/03-ambiguous.md'), 'ambiguous');
}

async function testPerfDummyThresholds() {
    const root = await makeWorkspace('perf');
    const pass = runCli(root, ['perf-dummy', '2', '5', '--max-ms', '10000', '--max-heap-mb', '512']);
    assert.equal(pass.status, 0, combinedOutput(pass));

    const fail = runCli(root, ['perf-dummy', '2', '5', '--max-heap-mb', '0']);
    assert.notEqual(fail.status, 0, combinedOutput(fail));
    assert.match(combinedOutput(fail), /PERF failed: heap/);
}

async function testPreviewIgnoreHoverPatterns() {
    const { shouldIgnorePreviewHover } = require('../out/core/formal-core.js');
    const config = {
        preview: {
            ignoreHover: [
                'appendix-b-concepts.md',
                'book2/**/concept-index.md',
                'appendix-*.md'
            ]
        }
    };

    assert.equal(shouldIgnorePreviewHover('book1/appendix-b-concepts.md', config), true);
    assert.equal(shouldIgnorePreviewHover('book2/vol-1/concept-index.md', config), true);
    assert.equal(shouldIgnorePreviewHover('book3/appendix-c.md', config), true);
    assert.equal(shouldIgnorePreviewHover('book4/01-main.md', config), false);
    assert.equal(shouldIgnorePreviewHover('book1/01-main.md', config), false);
}

const tests = [
    ['finalize cross-file safety', testFinalizeCrossFileSafety],
    ['finish finalizes and verifies', testFinishFinalizesAndVerifies],
    ['migrate-ids scoped safety', testMigrateIdsScopedSafety],
    ['migrate-text-refs report', testMigrateTextRefsReport],
    ['custom dictionary text refs', testCustomDictionaryTextRefs],
    ['symbol cache', testSymbolCache],
    ['warns unbalanced symbol pattern', testWarnsUnbalancedSymbolPattern],
    ['recall boundaries and optional blocks', testRecallBoundariesAndOptionalBlocks],
    ['migrate-text-refs sections and audits', testMigrateTextRefsSectionsAndAudits],
    ['migrate-text-refs updates incoming refs by default', testMigrateTextRefsUpdatesIncomingByDefault],
    ['verify rejects non-hash ids', testVerifyRejectsNonHashIds],
    ['verify rejects missing definition content', testVerifyRejectsMissingDefinitionContent],
    ['scan exclude and zero introduction pages', testScanExcludeAndZeroIntroductionPages],
    ['page title uses unique highest heading', testPageTitleUsesUniqueHighestHeading],
    ['perf-dummy thresholds', testPerfDummyThresholds],
    ['preview ignore hover patterns', testPreviewIgnoreHoverPatterns]
];

for (const [name, test] of tests) {
    await test();
    console.log(`ok - ${name}`);
}
