import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(repoRoot, 'out', 'cli', 'formal-tools.js');
const require = createRequire(import.meta.url);

function formalCore() {
    return require(path.join(repoRoot, 'packages', 'core', 'out', 'formal-core.js'));
}

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

function runCliWithEnv(cwd, args, env) {
    return spawnSync('node', [cliPath, ...args], {
        cwd,
        encoding: 'utf8',
        env: { ...process.env, ...env }
    });
}

function combinedOutput(result) {
    return `${result.stdout}\n${result.stderr}`;
}

function waitFor(condition, timeoutMs = 3000) {
    const startedAt = Date.now();
    return new Promise((resolve, reject) => {
        const check = async () => {
            try {
                const value = await condition();
                if (value) {
                    resolve(value);
                    return;
                }
                if (Date.now() - startedAt >= timeoutMs) {
                    reject(new Error('Timed out while waiting for Reader state.'));
                    return;
                }
                setTimeout(check, 50);
            } catch (error) {
                if (Date.now() - startedAt >= timeoutMs) {
                    reject(error);
                    return;
                }
                setTimeout(check, 50);
            }
        };
        void check();
    });
}

async function startReader(root, { projectPath = root, env = {} } = {}) {
    const args = ['serve'];
    if (projectPath) args.push(projectPath);
    args.push('--port', '0');
    const child = spawn('node', [cliPath, ...args], {
        cwd: root,
        env: { ...process.env, ...env },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    const ready = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Reader did not report a localhost URL.\n' + output)), 5000);
        const receive = chunk => {
            output += String(chunk);
            const match = output.match(/Markdown Formal Reader: (http:\/\/127\.0\.0\.1:\d+)/);
            if (!match) return;
            clearTimeout(timeout);
            resolve(match[1]);
        };
        child.stdout.on('data', receive);
        child.stderr.on('data', receive);
        child.once('error', error => {
            clearTimeout(timeout);
            reject(error);
        });
        child.once('exit', code => {
            if (output.includes('Markdown Formal Reader:')) return;
            clearTimeout(timeout);
            reject(new Error('Reader exited before startup with code ' + code + '.\n' + output));
        });
    });
    const url = await ready;
    return { child, url };
}

async function stopReader(child) {
    if (child.exitCode !== null) return;
    const done = new Promise(resolve => child.once('exit', resolve));
    child.kill('SIGTERM');
    await Promise.race([done, new Promise(resolve => setTimeout(resolve, 2000))]);
    if (child.exitCode === null) child.kill('SIGKILL');
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

async function testStructuredDefinitionMarkerContent() {
    const root = await makeWorkspace('structured-definition');
    await fs.writeFile(path.join(root, 'book1', '01-a.md'), [
        '# Chapter 1',
        '',
        '定义（算子网络环路）：一个算子网络环路由以下数据构成。',
        '',
        '**(i)** 给定有限有向图',
        '',
        '$$',
        'G=(V,E).',
        '$$',
        '',
        '允许含有有向闭路。',
        '',
        '**(ii)** 对每个节点给定局域算子。',
        '',
        '这句是定义后的普通正文，不应进入定义预览。',
        ''
    ].join('\n'));

    const prepare = runCli(root, ['prepare']);
    assert.equal(prepare.status, 0, combinedOutput(prepare));
    const previewCache = JSON.parse(await read(root, '.markdown-formal/preview-cache.json'));
    const definition = previewCache.definitions.find(item => item.title === '算子网络环路');
    assert.ok(definition);
    assert.match(definition.content, /\*\*\(i\)\*\* 给定有限有向图/);
    assert.match(definition.content, /G=\(V,E\)\./);
    assert.match(definition.content, /允许含有有向闭路。/);
    assert.match(definition.content, /\*\*\(ii\)\*\* 对每个节点给定局域算子。/);
    assert.doesNotMatch(definition.content, /定义后的普通正文/);
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
        '> 注 #h-8888888888888888（旁支事实）：这是放在引用块里的带锚点事实注释。',
        '> 证明：',
        '> 这行证明不应进入 recall 预览。',
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
    assert.equal(previewCache.entries['h-8888888888888888'].title, '旁支事实');
    assert.match(previewCache.entries['h-8888888888888888'].content, /^> 注/);
    assert.doesNotMatch(previewCache.entries['h-8888888888888888'].content, /不应进入 recall/);
    assert.equal(previewCache.entries['h-2222222222222222'].number, 1);
    assert.equal(previewCache.entries['h-4444444444444444'].number, 2);
    assert.equal(previewCache.entries['h-6666666666666666'].title, '有效分量包含律');
    assert.equal(previewCache.entries['h-7777777777777777'].title, '加粗标题');
    assert.equal(previewCache.entries['h-3333333333333333'].number, undefined);
    assert.equal(previewCache.entries['h-5555555555555555'].number, 1);

    const referenceMap = await read(root, '.markdown-formal/reference-map.md');
    assert.doesNotMatch(referenceMap, /注 1\.1/);
    assert.ok(referenceMap.includes('| 注 | `h-3333333333333333` | Important | `book1/01-a.md:11` |'));
    assert.ok(referenceMap.includes('| 注 | `h-8888888888888888` | 旁支事实 | `book1/01-a.md:14` |'));
    assert.match(referenceMap, /例 1\.1/);
}

async function testStrongMarkerWithSoftbreak() {
    const { parseFormalMarkerLine } = formalCore();
    const marker = parseFormalMarkerLine([
        '**命题 #h-2ebc63596b817afd（零化截断条件）**：设 $\\phi^\\natural \\in \\Omega$。',
        '对指标对 $(i,j)\\in I^2$，若：'
    ].join('\n'));

    assert.equal(marker?.type, 'prop');
    assert.equal(marker?.id, 'h-2ebc63596b817afd');
    assert.equal(marker?.title, '零化截断条件');
    assert.equal(marker?.markerText, '命题 #h-2ebc63596b817afd');
}

async function testDependencyGraph() {
    const root = await makeWorkspace('dependency-graph');
    await fs.writeFile(path.join(root, 'book1', '01-a.md'), [
        '# Chapter 1',
        '',
        '定理 #h-1111111111111111（Base）：Base statement.',
        '',
        '证明：',
        'The proof uses @h-2222222222222222.',
        '',
        '命题 #h-2222222222222222（Statement Uses）：由 @h-1111111111111111 可得 statement.',
        '',
        'Proof.',
        'The proof uses @h-3333333333333333.',
        '',
        '## #h-4444444444444444 Notes',
        '',
        'Ambient prose cites @h-1111111111111111 but should not become a theorem dependency.',
        ''
    ].join('\n'));
    await fs.writeFile(path.join(root, 'book1', '02-b.md'), [
        '# Chapter 2',
        '',
        '引理 #h-3333333333333333（Cross Chapter）：Cross statement.',
        ''
    ].join('\n'));

    const prepare = runCli(root, ['prepare']);
    assert.equal(prepare.status, 0, combinedOutput(prepare));

    const graph = JSON.parse(await read(root, '.markdown-formal/dependency-graph.json'));
    assert.equal(graph.schemaVersion, 1);
    assert.equal(graph.nodes.length, 3);
    assert.equal(graph.edges.length, 3);
    assert.equal(graph.summary.statementEdges, 1);
    assert.equal(graph.summary.proofEdges, 2);
    assert.equal(graph.summary.crossChapterEdges, 1);
    assert.equal(graph.summary.cycles, 1);
    assert.equal(graph.diagnostics.filter(item => item.code === 'ambient-theorem-ref').length, 1);

    const edgeKey = edge => `${edge.from}->${edge.to}:${edge.where}`;
    assert.ok(graph.edges.map(edgeKey).includes('h-1111111111111111->h-2222222222222222:proof'));
    assert.ok(graph.edges.map(edgeKey).includes('h-2222222222222222->h-1111111111111111:statement'));
    assert.ok(graph.edges.map(edgeKey).includes('h-2222222222222222->h-3333333333333333:proof'));
    assert.deepEqual(graph.cycles[0].ids.sort(), ['h-1111111111111111', 'h-2222222222222222']);

    const report = await read(root, '.markdown-formal/dependency-report.md');
    assert.match(report, /Proof edges: 2/);
    assert.match(report, /Cross-Scope Edges/);
    assert.match(report, /ambient-theorem-ref/);

    const graphCommand = runCli(root, ['graph']);
    assert.equal(graphCommand.status, 0, combinedOutput(graphCommand));
    assert.match(combinedOutput(graphCommand), /OK graph: 3 nodes, 3 explicit edges, 2 proof edges, 1 cycles/);

    const graphSummary = runCli(root, ['graph', 'summary']);
    assert.equal(graphSummary.status, 0, combinedOutput(graphSummary));
    assert.match(combinedOutput(graphSummary), /# Dependency Graph Summary/);
    assert.match(combinedOutput(graphSummary), /- Proof edges: 2/);
    assert.match(combinedOutput(graphSummary), /- Cross-chapter edges: 1/);

    const proofSummary = runCli(root, ['graph', 'summary', '--where', 'proof']);
    assert.equal(proofSummary.status, 0, combinedOutput(proofSummary));
    assert.match(combinedOutput(proofSummary), /# Dependency Graph Summary \(proof edges only\)/);
    assert.match(combinedOutput(proofSummary), /- Statement edges: 0/);
    assert.match(combinedOutput(proofSummary), /- Proof edges: 2/);

    const impact = runCli(root, ['graph', 'impact', '@h-1111111111111111']);
    assert.equal(impact.status, 0, combinedOutput(impact));
    assert.match(combinedOutput(impact), /# Dependency Impact Closure/);
    assert.match(combinedOutput(impact), /Downstream impacted nodes: 1/);
    assert.match(combinedOutput(impact), /命题 1\.2 Statement Uses/);

    const upstream = runCli(root, ['graph', 'upstream', 'h-2222222222222222']);
    assert.equal(upstream.status, 0, combinedOutput(upstream));
    assert.match(combinedOutput(upstream), /# Dependency Upstream Closure/);
    assert.match(combinedOutput(upstream), /定理 1\.1 Base/);
    assert.match(combinedOutput(upstream), /引理 2\.1 Cross Chapter/);

    const focus = runCli(root, ['graph', 'focus', 'h-2222222222222222', '--depth', '1']);
    assert.equal(focus.status, 0, combinedOutput(focus));
    assert.match(combinedOutput(focus), /# Dependency Focus Depth 1/);
    assert.match(combinedOutput(focus), /## Upstream/);
    assert.match(combinedOutput(focus), /## Downstream Impact/);
    assert.match(combinedOutput(focus), /## Local Edges/);

    const matrix = runCli(root, ['graph', 'matrix', 'chapter']);
    assert.equal(matrix.status, 0, combinedOutput(matrix));
    assert.match(combinedOutput(matrix), /# Dependency Matrix By chapter/);
    assert.match(combinedOutput(matrix), /Edges: 3/);

    const cycles = runCli(root, ['graph', 'cycles']);
    assert.equal(cycles.status, 0, combinedOutput(cycles));
    assert.match(combinedOutput(cycles), /Cycles: 1/);

    const statementCycles = runCli(root, ['graph', 'cycles', '--where=statement']);
    assert.equal(statementCycles.status, 0, combinedOutput(statementCycles));
    assert.match(combinedOutput(statementCycles), /# Dependency Cycles \(statement edges only\)/);
    assert.match(combinedOutput(statementCycles), /Cycles: 0/);

    const isolated = runCli(root, ['graph', 'isolated']);
    assert.equal(isolated.status, 0, combinedOutput(isolated));
    assert.match(combinedOutput(isolated), /Isolated nodes: 0/);

    const bridges = runCli(root, ['graph', 'bridges']);
    assert.equal(bridges.status, 0, combinedOutput(bridges));
    assert.match(combinedOutput(bridges), /# Bridge Candidates/);
    assert.match(combinedOutput(bridges), /命题 1\.2 Statement Uses/);
}

async function testEquationFigureTableNumbering() {
    const root = await makeWorkspace('media-numbering');
    await fs.writeFile(path.join(root, 'book1', '01-a.md'), [
        '# Chapter 1',
        '',
        '公式 #h-1111111111111111：',
        '$$',
        '\\rho(T)<1',
        '$$',
        '',
        '![Feedback loop](assets/feedback.svg)',
        '',
        '图 #h-2222222222222222（反馈环）：谱半径由反馈环控制。',
        '',
        '表 #h-3333333333333333（稳定性条件）：',
        '',
        '| 条件 | 结论 |',
        '| --- | --- |',
        '| $\\rho(T)<1$ | 收敛 |',
        '',
        '见 公式 (1.1)、Figure 1.1 和 表 1.1。',
        ''
    ].join('\n'));
    await fs.writeFile(path.join(root, 'book1', 'appendix-a-estimates.md'), [
        '# Appendix A',
        '',
        '公式 #h-4444444444444444：',
        '$$',
        '\\|[D,\\chi_R]\\|\\to 0',
        '$$',
        ''
    ].join('\n'));

    const apply = runCli(root, ['migrate-text-refs', '--apply', 'book1/01-a.md']);
    assert.equal(apply.status, 0, combinedOutput(apply));
    const chapter = await read(root, 'book1/01-a.md');
    assert.match(chapter, /见 @h-1111111111111111、@h-2222222222222222 和 @h-3333333333333333。/);

    const previewCache = JSON.parse(await read(root, '.markdown-formal/preview-cache.json'));
    assert.equal(previewCache.entries['h-1111111111111111'].type, 'equation');
    assert.equal(previewCache.entries['h-1111111111111111'].number, 1);
    assert.equal(previewCache.entries['h-2222222222222222'].type, 'figure');
    assert.equal(previewCache.entries['h-2222222222222222'].title, '反馈环');
    assert.equal(previewCache.entries['h-3333333333333333'].type, 'table');
    assert.equal(previewCache.entries['h-4444444444444444'].appendix, 'A');
    assert.equal(previewCache.entries['h-4444444444444444'].number, 1);

    const referenceMap = await read(root, '.markdown-formal/reference-map.md');
    assert.match(referenceMap, /公式 \(1\.1\)/);
    assert.match(referenceMap, /图 1\.1/);
    assert.match(referenceMap, /表 1\.1/);
    assert.match(referenceMap, /公式 \(A\.1\)/);
}

async function testStructuredMarkerValidation() {
    const root = await makeWorkspace('structured-marker-validation');
    await fs.writeFile(path.join(root, 'book1', '01-a.md'), [
        '# Chapter 1',
        '',
        '公式 #h-1111111111111111：',
        'This is not display math.',
        '',
        '图 #h-2222222222222222：No nearby image.',
        '',
        '表 #h-3333333333333333（Broken table）：',
        'No table follows.',
        ''
    ].join('\n'));

    const verify = runCli(root, ['verify']);
    assert.notEqual(verify.status, 0, combinedOutput(verify));
    assert.match(combinedOutput(verify), /equation-target-missing/);
    assert.match(combinedOutput(verify), /figure-target-missing/);
    assert.match(combinedOutput(verify), /table-target-missing/);

    const report = await read(root, '.markdown-formal/report.md');
    assert.match(report, /figure-caption-missing/);
}

async function testCrossBookReferencesRequireDependencies() {
    const root = await makeWorkspace('cross-book-refs');
    await fs.mkdir(path.join(root, 'book2'), { recursive: true });
    await fs.writeFile(path.join(root, 'book1', '01-a.md'), [
        '# Book 1 Chapter',
        '',
        '定理 #h-1111111111111111（Source）：Statement.',
        ''
    ].join('\n'));
    await fs.writeFile(path.join(root, 'book2', '01-b.md'), [
        '# Book 2 Chapter',
        '',
        'Use @h-1111111111111111.',
        ''
    ].join('\n'));

    const blocked = runCli(root, ['verify']);
    assert.notEqual(blocked.status, 0, combinedOutput(blocked));
    assert.match(combinedOutput(blocked), /cross-book-ref-disallowed/);

    await fs.mkdir(path.join(root, '.markdown-formal'), { recursive: true });
    await fs.writeFile(path.join(root, '.markdown-formal', 'config.json'), JSON.stringify({
        lookup: {
            bookDependencies: {
                book2: ['book1']
            }
        }
    }, null, 2));

    const allowed = runCli(root, ['verify']);
    assert.equal(allowed.status, 0, combinedOutput(allowed));
}

async function testChapterPageReferences() {
    const root = await makeWorkspace('chapter-page-refs');
    await fs.mkdir(path.join(root, 'book2'), { recursive: true });
    await fs.writeFile(path.join(root, 'book1', 'intro.md'), [
        '# #h-aaaaaaaaaaaaaaaa Book Intro',
        '',
        'Intro page.',
        ''
    ].join('\n'));
    await fs.writeFile(path.join(root, 'book1', '01-a.md'), [
        '# Chapter 1',
        '',
        '见 @chapter:./02-b.md.full，也可回到 @page:./intro.md.title。',
        '同样可以引用页面 hash：@h-bbbbbbbbbbbbbbbb.full 与 @h-aaaaaaaaaaaaaaaa.title。',
        ''
    ].join('\n'));
    await fs.writeFile(path.join(root, 'book1', '02-b.md'), [
        '# #h-bbbbbbbbbbbbbbbb Target Chapter',
        '',
        '定理 #h-1111111111111111（Target）：Statement.',
        ''
    ].join('\n'));
    await fs.writeFile(path.join(root, 'book2', '01-other.md'), [
        '# Other Book',
        '',
        'Other content.',
        ''
    ].join('\n'));

    const finish = runCli(root, ['finish', 'book1/01-a.md']);
    assert.equal(finish.status, 0, combinedOutput(finish));
    const chapter = await read(root, 'book1/01-a.md');
    assert.match(chapter, /@chapter:book1\/02-b\.md\.full/);
    assert.match(chapter, /@page:book1\/intro\.md\.title/);
    assert.match(chapter, /@h-bbbbbbbbbbbbbbbb\.full/);
    assert.match(chapter, /@h-aaaaaaaaaaaaaaaa\.title/);

    const referenceMap = await read(root, '.markdown-formal/reference-map.md');
    assert.match(referenceMap, /@h-bbbbbbbbbbbbbbbb/);
    assert.match(referenceMap, /@h-aaaaaaaaaaaaaaaa/);
    assert.match(referenceMap, /@chapter:book1\/02-b\.md/);
    assert.match(referenceMap, /@page:book1\/intro\.md/);

    await fs.writeFile(path.join(root, 'book1', '01-a.md'), [
        '# Chapter 1',
        '',
        'Wrong kind @chapter:book1/intro.md.',
        ''
    ].join('\n'));
    const wrongKind = runCli(root, ['verify']);
    assert.notEqual(wrongKind.status, 0, combinedOutput(wrongKind));
    assert.match(combinedOutput(wrongKind), /page-ref-kind-mismatch/);

    await fs.writeFile(path.join(root, 'book2', '01-other.md'), [
        '# Other Book',
        '',
        'Cross book @chapter:../book1/02-b.md.',
        ''
    ].join('\n'));
    await fs.writeFile(path.join(root, 'book1', '01-a.md'), [
        '# Chapter 1',
        '',
        'Back to valid @page:book1/intro.md.',
        ''
    ].join('\n'));
    const blocked = runCli(root, ['verify']);
    assert.notEqual(blocked.status, 0, combinedOutput(blocked));
    assert.match(combinedOutput(blocked), /cross-book-page-ref-disallowed/);
}

async function testPageAnchorFinalize() {
    const root = await makeWorkspace('page-anchor-finalize');
    await fs.writeFile(path.join(root, 'book1', '01-a.md'), [
        '# #tmp-ch Draft Chapter',
        '',
        '正文引用本章 @tmp-ch.full。',
        '',
        '## #tmp-sec Local Section',
        '',
        '正文引用小节 @tmp-sec.title。',
        ''
    ].join('\n'));

    const finish = runCli(root, ['finish', 'book1/01-a.md']);
    assert.equal(finish.status, 0, combinedOutput(finish));
    const chapter = await read(root, 'book1/01-a.md');
    assert.doesNotMatch(chapter, /tmp-ch|tmp-sec/);
    assert.match(chapter, /^# #h-[a-f0-9]{16} Draft Chapter/m);
    assert.match(chapter, /^## #h-[a-f0-9]{16} Local Section/m);
    assert.match(chapter, /@h-[a-f0-9]{16}\.full/);
    assert.match(chapter, /@h-[a-f0-9]{16}\.title/);

    const referenceMap = await read(root, '.markdown-formal/reference-map.md');
    assert.match(referenceMap, /\| 第 1 章 \| `@h-[a-f0-9]{16}` \| `@chapter:book1\/01-a\.md` \| Draft Chapter \|/);
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

    const audit = runCli(root, ['audit', 'book1/01-lowered.md']);
    assert.equal(audit.status, 0, combinedOutput(audit));
    const report = await read(root, '.markdown-formal/audit.md');
    assert.doesNotMatch(report, /Lowered Chapter Title/);
    assert.match(report, /Local Section/);
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
    const { shouldIgnorePreviewHover } = formalCore();
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

async function testReaderServer() {
    const root = await makeWorkspace('reader');
    const chapterPath = path.join(root, 'book1', '01-foundations.md');
    await fs.writeFile(chapterPath, [
        '# #h-1111111111111111 Foundations',
        '',
        '## #h-2222222222222222 Compactness',
        '',
        '定理 #h-3333333333333333（Finite cover）：Every open cover has a finite subcover.',
        '',
        'Proof: direct.',
        '',
        'By @h-3333333333333333, the conclusion follows.',
        ''
    ].join('\n'));
    const prepare = runCli(root, ['prepare']);
    assert.equal(prepare.status, 0, combinedOutput(prepare));

    const reader = await startReader(root, {
        env: { MARKDOWN_FORMAL_READER_STATE: path.join(root, 'reader-projects.json') }
    });
    try {
        const readerDocumentResponse = await fetch(reader.url + '/');
        const contentSecurityPolicy = readerDocumentResponse.headers.get('content-security-policy') || '';
        assert.match(contentSecurityPolicy, /style-src-attr 'unsafe-inline'/);
        assert.doesNotMatch(contentSecurityPolicy, /script-src[^;]*'unsafe-inline'/);

        const state = await (await fetch(reader.url + '/api/state')).json();
        assert.equal(state.pages.length, 1);
        assert.equal(state.pages[0].filePath, 'book1/01-foundations.md');
        assert.equal('labels' in state, false);

        const page = await (await fetch(reader.url + '/api/page?path=book1%2F01-foundations.md')).json();
        assert.match(page.content, /Finite cover/);
        assert.equal(page.page.displayHeading, '第 1 章 Foundations');
        assert.equal(page.labels['h-3333333333333333'].content, undefined);

        const recall = await (await fetch(reader.url + '/api/recall?id=h-3333333333333333')).json();
        assert.match(recall.content, /Finite cover/);
        assert.equal(recall.display, '定理 1.1');

        const sectionRecall = await (await fetch(reader.url + '/api/recall?id=h-2222222222222222')).json();
        assert.match(sectionRecall.content, /Compactness/);
        assert.match(sectionRecall.content, /Finite cover/);
        assert.equal(sectionRecall.display, '§ 1.1');

        const initialRevision = state.revision;
        await fs.appendFile(chapterPath, '\nA live update.\n');
        const refreshed = await waitFor(async () => {
            const next = await (await fetch(reader.url + '/api/state')).json();
            return next.revision > initialRevision ? next : undefined;
        });
        assert.ok(refreshed.revision > initialRevision);
    } finally {
        await stopReader(reader.child);
    }
}

async function testReaderLauncher() {
    const root = await makeWorkspace('reader-launcher');
    await fs.writeFile(path.join(root, 'book1', '01-foundations.md'), [
        '# Foundations',
        '',
        'A Reader launcher fixture.',
        ''
    ].join('\n'));
    const prepare = runCli(root, ['prepare']);
    assert.equal(prepare.status, 0, combinedOutput(prepare));

    const recentStatePath = path.join(root, 'reader-projects.json');
    const env = { MARKDOWN_FORMAL_READER_STATE: recentStatePath };
    const boundReader = await startReader(root, { env });
    await stopReader(boundReader.child);

    const launcher = await startReader(root, { projectPath: null, env });
    try {
        const initial = await (await fetch(launcher.url + '/api/state')).json();
        assert.equal(initial.available, false);
        assert.equal(initial.recentProjects.length, 1);
        assert.equal(initial.recentProjects[0].rootName, path.basename(root));
        assert.equal('rootPath' in initial.recentProjects[0], false);

        const selected = await (await fetch(launcher.url + '/api/projects/recent', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ index: 0 })
        })).json();
        assert.equal(selected.available, true);
        assert.equal(selected.pages.length, 1);
        assert.equal(selected.rootName, path.basename(root));

        const page = await (await fetch(launcher.url + '/api/page?path=book1%2F01-foundations.md')).json();
        assert.match(page.content, /launcher fixture/);
    } finally {
        await stopReader(launcher.child);
    }
}

async function testPageHeadingFormatting() {
    const { formatPageHeading, formatPageHeadingPrefix } = formalCore();
    const chapter = {
        kind: 'chapter',
        filePath: 'book1/01-foundations.md',
        title: '基础',
        order: 1,
        unitLabel: '1',
        chapter: 1
    };
    const appendix = {
        kind: 'appendix',
        filePath: 'book1/appendix-a-symbols.md',
        title: '附录 A 符号表',
        order: 100001,
        unitLabel: 'A',
        appendix: 'A'
    };

    assert.equal(formatPageHeading(chapter, { language: 'zh' }), '第 1 章 基础');
    assert.equal(formatPageHeadingPrefix(chapter, { language: 'zh' }), '第 1 章');
    assert.equal(formatPageHeading({ ...chapter, title: '第 1 章 基础' }, { language: 'zh' }), '第 1 章 基础');
    assert.equal(formatPageHeading(chapter, { language: 'zh', render: { pageHeadingStyle: 'number-title' } }), '1 基础');
    assert.equal(formatPageHeading(chapter, { language: 'zh', render: { pageHeadingStyle: 'title' } }), '基础');
    assert.equal(formatPageHeading(appendix, { language: 'zh' }), '附录 A 符号表');
}

async function testExportMarkdownCompilesFormalSyntax() {
    const root = await makeWorkspace('export-md');
    await fs.writeFile(path.join(root, 'book1', '01-a.md'), [
        '# #h-aaaaaaaaaaaaaaaa Chapter One',
        '',
        '本章见 @h-aaaaaaaaaaaaaaaa.full。',
        '',
        '## #h-bbbbbbbbbbbbbbbb Section One',
        '',
        '命题 #h-cccccccccccccccc（Main）：Statement uses @h-bbbbbbbbbbbbbbbb.title.',
        '',
        '公式 #h-dddddddddddddddd：',
        '$$',
        'a=b',
        '$$',
        '',
        'See @h-cccccccccccccccc and @h-cccccccccccccccc.full.',
        '',
        'This **bold phrase** must stay bold.',
        '',
        '![pic](figures/main.png)',
        ''
    ].join('\n'));
    await fs.writeFile(path.join(root, 'book1', 'summary.md'), [
        '# Summary',
        '',
        'Summary page.',
        ''
    ].join('\n'));
    await fs.writeFile(path.join(root, 'book1', 'appendix-a-notes.md'), [
        '# #h-eeeeeeeeeeeeeeee Appendix Notes',
        '',
        'Appendix page.',
        ''
    ].join('\n'));

    const exported = runCli(root, ['export-md', 'book1', '--out', 'compiled.md']);
    assert.equal(exported.status, 0, combinedOutput(exported));
    const compiled = await read(root, 'compiled.md');
    assert.doesNotMatch(compiled, /#h-|@h-/);
    assert.match(compiled, /^# 第 1 章 Chapter One/m);
    assert.match(compiled, /本章见 第 1 章：Chapter One。/);
    assert.match(compiled, /^## 1\.1 Section One/m);
    assert.match(compiled, /命题 1\.1（Main）：Statement uses Section One\./);
    assert.match(compiled, /公式 \(1\.1\)：/);
    assert.match(compiled, /See 命题 1\.1 and 命题 1\.1（Main）\./);
    assert.match(compiled, /This \*\*bold phrase\*\* must stay bold\./);
    assert.match(compiled, /!\[pic\]\(book1\/figures\/main\.png\)/);
    assert.ok(compiled.indexOf('# Summary') > compiled.indexOf('# 第 1 章 Chapter One'));
    assert.ok(compiled.indexOf('# 附录 A Appendix Notes') > compiled.indexOf('# Summary'));
}

async function testExportMarkdownSplitCompilesFiles() {
    const root = await makeWorkspace('export-md-split');
    await fs.writeFile(path.join(root, 'book1', '01-a.md'), [
        '# #h-aaaaaaaaaaaaaaaa Chapter One',
        '',
        '本章见 @h-aaaaaaaaaaaaaaaa.full。',
        '',
        '## #h-bbbbbbbbbbbbbbbb Section One',
        '',
        '命题 #h-cccccccccccccccc（Main）：Statement uses @h-bbbbbbbbbbbbbbbb.title.',
        '',
        'See @h-cccccccccccccccc and @h-cccccccccccccccc.full.',
        '',
        'Read [next](02-b.md).',
        '',
        '![pic](figures/main.png)',
        ''
    ].join('\n'));
    await fs.writeFile(path.join(root, 'book1', '02-b.md'), [
        '# #h-dddddddddddddddd Chapter Two',
        '',
        'Back to @h-aaaaaaaaaaaaaaaa.title.',
        ''
    ].join('\n'));

    const exported = runCli(root, ['export-md-split', 'book1', '--out', 'dist/public']);
    assert.equal(exported.status, 0, combinedOutput(exported));
    assert.match(combinedOutput(exported), /OK export-md-split: 2 files -> dist\/public/);

    const chapter1 = await read(root, 'dist/public/book1/01-a.md');
    const chapter2 = await read(root, 'dist/public/book1/02-b.md');
    assert.doesNotMatch(chapter1, /#h-|@h-/);
    assert.doesNotMatch(chapter2, /#h-|@h-/);
    assert.match(chapter1, /^# 第 1 章 Chapter One/m);
    assert.match(chapter1, /本章见 第 1 章：Chapter One。/);
    assert.match(chapter1, /^## 1\.1 Section One/m);
    assert.match(chapter1, /命题 1\.1（Main）：Statement uses Section One\./);
    assert.match(chapter1, /See 命题 1\.1 and 命题 1\.1（Main）\./);
    assert.match(chapter1, /Read \[next\]\(02-b\.md\)\./);
    assert.match(chapter1, /!\[pic\]\(figures\/main\.png\)/);
    assert.doesNotMatch(chapter1, /\\pagebreak/);
    assert.match(chapter2, /^# 第 2 章 Chapter Two/m);
    assert.match(chapter2, /Back to Chapter One\./);
}

async function makeFakePandoc(root) {
    const bin = path.join(root, 'bin');
    const logPath = path.join(root, 'pandoc-args.json');
    const scriptPath = path.join(bin, 'pandoc');
    await fs.mkdir(bin, { recursive: true });
    await fs.writeFile(scriptPath, [
        '#!/usr/bin/env node',
        "const fs = require('node:fs');",
        "const path = require('node:path');",
        'const args = process.argv.slice(2);',
        "if (args.includes('-t') && args[args.indexOf('-t') + 1] === 'latex') {",
        "  const input = fs.readFileSync(0, 'utf8');",
        "  const output = input",
        "    .replace(/^#\\s+(.+?)\\s*\\{[^}]*\\}\\s*$/gm, '\\\\section*{$1}')",
        "    .replace(/\\$([^$]+)\\$/g, '\\\\($1\\\\)');",
        "  process.stdout.write(output);",
        "  process.exit(0);",
        "}",
        "fs.writeFileSync(process.env.PANDOC_LOG, JSON.stringify(args));",
        "if (process.env.PANDOC_INPUT_LOG && args[0]) {",
        "  fs.writeFileSync(process.env.PANDOC_INPUT_LOG, fs.readFileSync(path.resolve(process.cwd(), args[0]), 'utf8'));",
        "}",
        "const includeBeforeIndex = args.indexOf('--include-before-body');",
        "if (process.env.PANDOC_INCLUDE_BEFORE_LOG && includeBeforeIndex >= 0 && args[includeBeforeIndex + 1]) {",
        "  fs.writeFileSync(process.env.PANDOC_INCLUDE_BEFORE_LOG, fs.readFileSync(path.resolve(process.cwd(), args[includeBeforeIndex + 1]), 'utf8'));",
        "}",
        "const outIndex = args.indexOf('-o');",
        'if (outIndex >= 0 && args[outIndex + 1]) {',
        '  const output = path.resolve(process.cwd(), args[outIndex + 1]);',
        '  fs.mkdirSync(path.dirname(output), { recursive: true });',
        "  fs.writeFileSync(output, 'PDF');",
        '}',
        ''
    ].join('\n'));
    await fs.chmod(scriptPath, 0o755);
    return { bin, logPath };
}

async function testRenderPdfUsesPandocRenderer() {
    const root = await makeWorkspace('render-pdf');
    await fs.writeFile(path.join(root, 'compiled.md'), '# Compiled Book\n\nThis is already ordinary Markdown.\n');

    const usage = runCli(root, ['render-pdf']);
    assert.notEqual(usage.status, 0, combinedOutput(usage));
    assert.match(combinedOutput(usage), /render-pdf <compiled\.md>/);
    assert.match(combinedOutput(usage), /--variable key:value/);
    await assert.rejects(() => fs.stat(path.join(root, '.markdown-formal', 'config.json')));

    await fs.mkdir(path.join(root, '.markdown-formal'), { recursive: true });
    await fs.writeFile(path.join(root, '.markdown-formal', 'config.json'), JSON.stringify({
        language: 'zh',
        pdf: {
            title: '算子演化论',
            subtitle: '卷 I：规范空间与算子',
            author: 'GLENZLI',
            date: 'Revised 2026-06-26',
            releaseVersion: 'rc.1',
            showVersionOnCover: true,
            documentClass: 'ctexbook',
            titlePage: true
        }
    }, null, 2));

    const { bin, logPath } = await makeFakePandoc(root);
    const rendered = runCliWithEnv(root, [
        'render-pdf',
        'compiled.md',
        '--out',
        'dist/book.pdf',
        '--paper',
        'letter',
        '--margin',
        '1in',
        '--toc-depth',
        '3',
        '--variable',
        'mainfont:STSong',
        '-V',
        'header-includes:test'
    ], {
        PATH: `${bin}${path.delimiter}${process.env.PATH || ''}`,
        PANDOC_LOG: logPath
    });

    assert.equal(rendered.status, 0, combinedOutput(rendered));
    assert.match(combinedOutput(rendered), /OK render-pdf: compiled\.md -> dist\/book\.pdf/);
    assert.match(combinedOutput(rendered), /paper=letter, margin=1in, lang=zh-CN, toc=on, toc-depth=3, toc-title=目录, title-page=on, cover-style=simple, release-version=rc\.1, show-version-on-cover=on, metadata-page=off, toc-page-break=on, pdf-engine=xelatex/);
    const coverHeader = '\\renewcommand{\\maketitle}{\\begin{titlepage}\\thispagestyle{empty}\\vspace*{0.20\\textheight}\\begin{center}{\\fontsize{32pt}{40pt}\\selectfont \\bfseries 算子演化论\\par}\\vspace{1.2em}{\\fontsize{18pt}{23pt}\\selectfont 卷 I：规范空间与算子\\par}\\vfill{\\fontsize{12pt}{15pt}\\selectfont GLENZLI\\par}\\vspace{0.8em}{\\fontsize{12pt}{15pt}\\selectfont Revised 2026-06-26\\par}\\vspace{0.8em}{\\fontsize{12pt}{15pt}\\selectfont rc.1\\par}\\end{center}\\end{titlepage}}';
    assert.doesNotMatch(coverHeader, /%/);
    assert.deepEqual(JSON.parse(await fs.readFile(logPath, 'utf8')), [
        'compiled.md',
        '-o',
        'dist/book.pdf',
        '--pdf-engine',
        'xelatex',
        '-V',
        'papersize:letter',
        '-V',
        'geometry:margin=1in',
        '-V',
        'lang:zh-CN',
        '-V',
        'toc-title:目录',
        '-V',
        'documentclass:ctexbook',
        '-V',
        'title:算子演化论',
        '-V',
        'subtitle:卷 I：规范空间与算子',
        '-V',
        'author:GLENZLI',
        '-V',
        'date:Revised 2026-06-26',
        '-V',
        'version:rc.1',
        '-V',
        'classoption:titlepage',
        '-V',
        `header-includes:${coverHeader}`,
        '-V',
        `header-includes:${'\\let\\markdownFormalOldTableOfContents\\tableofcontents\\renewcommand{\\tableofcontents}{\\clearpage\\markdownFormalOldTableOfContents\\clearpage}'}`,
        '-V',
        'mainfont:STSong',
        '-V',
        'header-includes:test',
        '--toc',
        '--toc-depth',
        '3'
    ]);
    assert.equal(await read(root, 'dist/book.pdf'), 'PDF');
    await assert.rejects(() => fs.stat(path.join(root, '.markdown-formal', 'preview-cache.json')));
    assert.ok(await read(root, '.markdown-formal/config.json'));
}

async function testRenderPdfMetadataPage() {
    const root = await makeWorkspace('render-pdf-metadata');
    const originalMarkdown = '# Body\n\nCompiled body.\n';
    await fs.writeFile(path.join(root, 'compiled.md'), originalMarkdown);
    await fs.writeFile(path.join(root, 'license-note.md'), 'License note with $L$.\n');
    await fs.writeFile(path.join(root, 'ai-en.md'), 'AI assistance statement with $A$.\n');
    await fs.mkdir(path.join(root, '.markdown-formal'), { recursive: true });
    await fs.writeFile(path.join(root, '.markdown-formal', 'config.json'), JSON.stringify({
        language: 'zh',
        pdf: {
            author: 'Zhe Li',
            authorNative: '李喆',
            authorAliases: ['Glen Li / glenzli'],
            orcid: 'https://orcid.org/0009-0006-6536-3453',
            repository: 'https://github.com/glenzli/formal-math',
            license: 'CC BY 4.0',
            licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
            preferredCitation: 'Zhe Li ... licensed under CC BY 4.0.',
            releaseVersion: 'rc.1',
            frontMatter: [
                {
                    title: 'AI 辅助声明',
                    content: '本书使用 $A$ 作为辅助工具。',
                    toc: false,
                    pageBreakAfter: true
                },
                {
                    title: 'License Note',
                    source: 'license-note.md',
                    toc: true,
                    pageBreakAfter: true
                }
            ]
        }
    }, null, 2));

    const { bin, logPath } = await makeFakePandoc(root);
    const inputLogPath = path.join(root, 'pandoc-input.md');
    const includeBeforeLogPath = path.join(root, 'pandoc-before.tex');
    const rendered = runCliWithEnv(root, [
        'render-pdf',
        'compiled.md',
        '--out',
        'dist/book.pdf',
        '--metadata-page',
        '--author-alias',
        'G. Li',
        '--release-tag',
        'v0.1.0',
        '--release-commit',
        'abc123',
        '--doi',
        '10.1234/formal',
        '--front-matter',
        'ai-en.md',
        '--front-matter-title',
        'AI Assistance Statement'
    ], {
        PATH: `${bin}${path.delimiter}${process.env.PATH || ''}`,
        PANDOC_LOG: logPath,
        PANDOC_INPUT_LOG: inputLogPath,
        PANDOC_INCLUDE_BEFORE_LOG: includeBeforeLogPath
    });

    assert.equal(rendered.status, 0, combinedOutput(rendered));
    assert.match(combinedOutput(rendered), /metadata-page=on/);
    const pandocArgs = JSON.parse(await fs.readFile(logPath, 'utf8'));
    assert.equal(pandocArgs[0], 'compiled.md');
    const includeBeforeIndex = pandocArgs.indexOf('--include-before-body');
    assert.ok(includeBeforeIndex > 0);
    assert.match(pandocArgs[includeBeforeIndex + 1], /\.publication\.tex$/);
    assert.ok(pandocArgs.includes('author:Zhe Li'));
    assert.equal(pandocArgs.some(item => String(item).includes('李喆') || String(item).includes('glenzli')), false);

    const pandocInput = await fs.readFile(inputLogPath, 'utf8');
    assert.equal(pandocInput, originalMarkdown);
    const metadataInput = await fs.readFile(includeBeforeLogPath, 'utf8');
    assert.match(metadataInput, /\\clearpage\n\\section\*\{Publication Metadata\}/);
    assert.match(metadataInput, /\\item\[Author\] Zhe Li/);
    assert.match(metadataInput, /\\item\[Native name\] 李喆/);
    assert.match(metadataInput, /\\item\[Also known as\] Glen Li \/ glenzli; G\. Li/);
    assert.match(metadataInput, /\\item\[ORCID\] https:\/\/orcid\.org\/0009-0006-6536-3453/);
    assert.match(metadataInput, /\\item\[Repository\] https:\/\/github\.com\/glenzli\/formal-math/);
    assert.match(metadataInput, /\\item\[License\] CC BY 4\.0 \(https:\/\/creativecommons\.org\/licenses\/by\/4\.0\/\)/);
    assert.match(metadataInput, /\\item\[Release version\] rc\.1/);
    assert.match(metadataInput, /\\item\[Release tag\] v0\.1\.0/);
    assert.match(metadataInput, /\\item\[Commit\] abc123/);
    assert.match(metadataInput, /\\item\[DOI\] 10\.1234\/formal/);
    assert.match(metadataInput, /\\item\[Preferred citation\] Zhe Li \.\.\. licensed under CC BY 4\.0\./);
    assert.match(metadataInput, /\\end\{description\}\n\\clearpage/);
    assert.ok(metadataInput.indexOf('\\section*{Publication Metadata}') < metadataInput.indexOf('\\section*{AI 辅助声明}'));
    assert.ok(metadataInput.indexOf('\\section*{AI 辅助声明}') < metadataInput.indexOf('\\section*{License Note}'));
    assert.ok(metadataInput.indexOf('\\section*{License Note}') < metadataInput.indexOf('\\section*{AI Assistance Statement}'));
    assert.match(metadataInput, /\\section\*\{AI 辅助声明\}/);
    assert.match(metadataInput, /本书使用 \\\(A\\\) 作为辅助工具。/);
    assert.doesNotMatch(metadataInput, /\\addcontentsline\{toc\}\{section\}\{AI 辅助声明\}/);
    assert.match(metadataInput, /\\section\*\{License Note\}/);
    assert.match(metadataInput, /\\addcontentsline\{toc\}\{section\}\{License Note\}/);
    assert.match(metadataInput, /License note with \\\(L\\\)\./);
    assert.match(metadataInput, /\\section\*\{AI Assistance Statement\}/);
    assert.match(metadataInput, /AI assistance statement with \\\(A\\\)\./);
    assert.equal(await read(root, 'compiled.md'), originalMarkdown);
    await assert.rejects(() => fs.stat(path.join(root, pandocArgs[includeBeforeIndex + 1])));
}

async function testAuditReport() {
    const root = await makeWorkspace('audit');
    await fs.writeFile(path.join(root, 'book1', '01-a.md'), [
        '# Chapter 1',
        '',
        '定理 #h-1111111111111111（Base）：Statement without a proof boundary.',
        '',
        '由 定理 1.1 和 (1.1) 可得结论。',
        '进一步见第 2 章。',
        '链接 [定理 1.1](old.md#thm) 需要人工处理。',
        '',
        '## Plain Heading',
        '',
        '例 #h-2222222222222222（Unused）：This example is indexed but never cited.',
        ''
    ].join('\n'));
    await fs.writeFile(path.join(root, 'book1', '02-b.md'), [
        '# Chapter 2',
        '',
        'Second chapter.',
        ''
    ].join('\n'));

    const audit = runCli(root, ['audit']);
    assert.equal(audit.status, 0, combinedOutput(audit));
    assert.match(combinedOutput(audit), /WARN audit:/);

    const report = await read(root, '.markdown-formal/audit.md');
    assert.match(report, /Typed old references: 1/);
    assert.match(report, /Markdown links needing manual rewrite: 1/);
    assert.match(report, /Chapter references needing page refs: 1/);
    assert.match(report, /Section headings needing numbered markers: 1/);
    assert.match(report, /Bare number candidates: 1/);
    assert.match(report, /Unused optional example hashes: 1/);
    assert.match(report, /Theorem-like blocks without proof boundary: 1/);
    assert.match(report, /定理 1\.1 -> @h-1111111111111111/);
    assert.match(report, /bare-number-candidate|Bare Number Candidates/);
    assert.match(report, /例 1\.1 `h-2222222222222222`/);
    assert.match(report, /第 2 章; suggested @chapter:book1\/02-b\.md/);
}

const tests = [
    ['finalize cross-file safety', testFinalizeCrossFileSafety],
    ['finish finalizes and verifies', testFinishFinalizesAndVerifies],
    ['migrate-ids scoped safety', testMigrateIdsScopedSafety],
    ['migrate-text-refs report', testMigrateTextRefsReport],
    ['custom dictionary text refs', testCustomDictionaryTextRefs],
    ['structured definition marker content', testStructuredDefinitionMarkerContent],
    ['symbol cache', testSymbolCache],
    ['warns unbalanced symbol pattern', testWarnsUnbalancedSymbolPattern],
    ['recall boundaries and optional blocks', testRecallBoundariesAndOptionalBlocks],
    ['strong marker with softbreak', testStrongMarkerWithSoftbreak],
    ['dependency graph', testDependencyGraph],
    ['equation figure table numbering', testEquationFigureTableNumbering],
    ['structured marker validation', testStructuredMarkerValidation],
    ['cross-book references require dependencies', testCrossBookReferencesRequireDependencies],
    ['chapter page references', testChapterPageReferences],
    ['page anchor finalize', testPageAnchorFinalize],
    ['migrate-text-refs sections and audits', testMigrateTextRefsSectionsAndAudits],
    ['migrate-text-refs updates incoming refs by default', testMigrateTextRefsUpdatesIncomingByDefault],
    ['verify rejects non-hash ids', testVerifyRejectsNonHashIds],
    ['verify rejects missing definition content', testVerifyRejectsMissingDefinitionContent],
    ['scan exclude and zero introduction pages', testScanExcludeAndZeroIntroductionPages],
    ['page title uses unique highest heading', testPageTitleUsesUniqueHighestHeading],
    ['perf-dummy thresholds', testPerfDummyThresholds],
    ['preview ignore hover patterns', testPreviewIgnoreHoverPatterns],
    ['local Reader server', testReaderServer],
    ['local Reader launcher', testReaderLauncher],
    ['page heading formatting', testPageHeadingFormatting],
    ['export-md compiles formal syntax', testExportMarkdownCompilesFormalSyntax],
    ['export-md-split compiles files', testExportMarkdownSplitCompilesFiles],
    ['render-pdf uses pandoc renderer', testRenderPdfUsesPandocRenderer],
    ['render-pdf metadata page', testRenderPdfMetadataPage],
    ['audit report', testAuditReport]
];

for (const [name, test] of tests) {
    await test();
    console.log(`ok - ${name}`);
}
