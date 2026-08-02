---
vasm:
  alias: markdown-formal-integrator-guide
  version: "0.1.0"
  intent: "Guide target-project AI agents to merge markdown-formal executable writing rules into native writing workflows."
  compile:
    format: integrative
  integration:
    appliesTo:
      - "vasm:markdown-formal-editor-skill"
      - "editor"
      - "skills-src/editor.vasm.md"
      - "skills/editor.md"
---

# markdown-formal integrative 组件

这个文件是 `markdown-formal` 的 integrative 组件，用于指导 AI 把 [editor.md](../skills/editor.md) 的 executable 写作规则融合进目标项目的原生写作、迁移、审阅和发布流程。它会生成组合指导 artifact，并通过 VASMC catalog 导出为可锁定 artifact。组合时应把它当作“如何合并能力”的 guide，而不是最终可执行 prompt 或给人阅读的安装文档。

## 组合边界

- [editor.md](../skills/editor.md) 是可执行写作规则产物；本文件只说明如何把这些规则嵌入目标项目已有 AI 能力。
- 目标项目自己的 `AGENTS.md`、写作 skill、证明风格、术语偏好、章节模板和 release 流程是最终承载面。
- 不要把 `markdown-formal` 作为外层孤立 skill 叠加；应把编号、定义、符号、依赖图、校验和导出规则接入目标项目原有动作。
- 不要为了工具统一改写目标项目文风；定义句式、证明组织和术语表达仍由目标项目决定。
- 不要把本 guide 直接 inline 进最终 executable prompt。对外复用时优先通过 VASMC catalog artifact 暴露，并让 consumer lockfile 固定 hash。
- 不要自动下载、安装或更新远端 skill；release 或 vendored bundle 仍应经过 diff、checksum 和人工/AI 审阅。

## 组合输入

整合前按这个顺序读取：

1. 目标项目原生 AI 指令入口，例如 `AGENTS.md`、`CLAUDE.md`、`GEMINI.md`、项目内 writing skill 或 release skill。
2. `markdown-formal` 的 [editor.md](../skills/editor.md)，把它视为具体执行规则。
3. 目标项目已有 `.markdown-formal/config.json`、`.markdown-formal/agent-guide.md`、`.markdown-formal/reference-map.md` 和 `package.json` scripts。
4. 目标项目当前的写作样例，尤其是章节标题、定理类对象、定义、符号说明、注/例、附录和 release 产物。

如果目标项目还没有 `.markdown-formal/agent-guide.md` 或 `reference-map.md`，先接入 CLI 并运行：

```bash
npm run formal -- prepare
```

## 必须保留的能力契约

[核心模型](../docs-src/fragments/formal-core-model.vasm.md "@import:inline")

只融合 hash 编号规则是不完整接入。完整整合必须同时保留定义查询、符号查询、依赖图、迁移边界、`.markdown-formal` 源表职责，以及 `prepare` / `finish` / `verify` 的闭环。

## 合并到目标项目的哪些位置

把 `editor.md` 的规则拆进目标项目已有结构，而不是整段贴到末尾：

- 写作前置流程：加入 `npm run formal -- prepare`、读取 `agent-guide.md` 和 `reference-map.md`。
- 编号与引用规则：加入 `#tmp-*` 声明、`@h-...` 引用、章/页 hash、公式/图/表 marker、完成后 `finish`。
- 数学正文规范：加入“定义不加 hash”“说明类注默认不加 hash”“需要证明或后文引用的注才加 hash”“例默认不加 hash，后文引用时反向加 hash”。
- 概念查询流程：加入工具自动抽标准定义，AI 只补非标准定义、别名/中英互查和不可靠边界。
- 符号查询流程：加入 AI 维护特殊 LaTeX 记号表，不索引通用符号或整条公式。
- 依赖图审阅流程：加入 `graph impact`、`graph focus`、`graph summary`、`graph cycles`、`graph matrix`，并区分 statement/proof/body 依赖。
- 迁移流程：加入 `migrate-text-refs`、`migrate-ids`、incoming refs 和 `--target-only` 的边界。
- 发布流程：加入 `export-md`、`export-pdf`、`render-pdf` 的位置，项目级 metadata、签名、DOI、witness 等后处理仍由目标项目负责。
- 完成标准：加入 `finish <file-or-dir>`、`verify`、必要的 `audit` 或依赖图审阅，不允许只手写 hash 或只运行一个编号工具就结束。

## 最小合并片段

下面是可以融入目标项目 AI 指令的最小规则块。整合时应拆到对应章节；不要作为安装记录原样贴在末尾。

```text
写作或迁移前运行 npm run formal -- prepare。
优先读取 .markdown-formal/agent-guide.md，再读取目标原文和 .markdown-formal/reference-map.md。

#h-... / #tmp-* 只用于声明位置，例如唯一最高级章/页标题、`命题 #tmp-*（Title）：...`、`## #tmp-* Title`、`公式 #tmp-*：`。正文引用一律使用 @h-...、@h-....title 或 @h-....full；不要写 `命题 #h-...`、`定理 #h-...`、`由 #h-...`。引用已有编号对象或章/页时，只能从 reference-map.md 复制 @h-... / @h-....title / @h-....full。重要引用附近保留自然语言语义，例如“由谱半径引理 `@h-...` 可得”；不要写成只有裸 `@h-...`。

新增小节、命题、引理、定理、推论、公式、图、表等 marker 使用 tmp-1/tmp-2/...，不要手动生成 hash。小节只用于编号和跳转；命题、引理、定理、推论的 recall 只覆盖 `证明` / `Proof` 前的陈述。公式、图、表各自独立编号，hash 不写进 LaTeX 公式内部。

定义不加 hash、不参与 ref。工具自动扫描标准 `定义（术语）：...` / `Definition (Term): ...` 并收集跨行范围；AI 只检查本次修改文件内新增、删除、改写的定义。非标准句式、aliases/中英互查、稳定多段预览或自动边界不可靠的定义，才写入 .markdown-formal/definitions.json，并记录 term、可选 aliases、source 和 Markdown content。

只把项目明确约定的特殊 LaTeX 记号写入 .markdown-formal/symbols.json，维护 source、pattern、meaning。pattern 必须是记号本身或完整记号族，不记录通用数学符号、整条推导公式或缺右边界的公式片段。

注释分两类：说明类注释默认不加 hash，写 `注（...）：...`；非主线事实注释如果需要证明、后文引用或稳定锚点，才写 `注 #tmp-*（...）：...`，也可以放在标准引用块中。这种带 hash 的注只隐藏 hash，不显示“注 x.x”，不进入预览目录，但保留 recall。例默认不加 hash；只有后文已经明确引用某个例时，才反向改成 `例 #tmp-*`。

命题依赖图由工具从显式 @h-... 生成，权威数据是 .markdown-formal/dependency-graph.json。AI 或 Lean 推测出的边必须另存为 suggested 数据，不能混入 explicit_ref 图。修改已有命题前，优先运行 `npm run formal -- graph impact <h-id>` 和 `npm run formal -- graph focus <h-id> --depth 2`；修改后用 `graph summary`、`graph cycles`、`graph matrix chapter|volume|book` 做结构审阅。

完成编辑后按本次修改范围检查编号对象、章/页引用、定义索引例外、符号索引、跨 book 查询配置、tmp ID 和迁移报告。写完运行 npm run formal -- finish <file-or-dir>，必要时再运行 npm run formal -- verify。保持 Markdown 和 LaTeX 原样。
```

## 工具接入契约

目标项目至少提供：

```json
{
  "scripts": {
    "formal": "node tools/markdown-formal/out/cli/formal-tools.js"
  }
}
```

常用命令应出现在目标项目 AI 流程中：

```bash
npm run formal -- prepare
npm run formal -- finish path/to/chapter-or-dir
npm run formal -- audit path/to/chapter-or-dir
npm run formal -- graph impact <h-id>
npm run formal -- graph focus <h-id> --depth 2
npm run formal -- graph matrix chapter
npm run formal -- verify
```

人工维护入口只有：

- `.markdown-formal/config.json`：语言、扫描排除、跨 book 查询依赖和 PDF 默认值等配置。
- `.markdown-formal/definitions.json`：AI 维护的定义查询例外源表。
- `.markdown-formal/symbols.json`：AI 维护的特殊符号源表。

其他 `.markdown-formal/` 文件是缓存、报告或生成索引。AI 可以读取它们，但不应把它们当作手工源文件维护。

## 配置合并规则

目标项目必须在 formal root 放置 `.markdown-formal/config.json`。CLI 和编辑器增强都以这个文件作为显式启用信号。

```json
{
  "language": "zh",
  "scan": {
    "exclude": [
      "build/**",
      ".context/**",
      "draft/**"
    ]
  },
  "lookup": {
    "bookDependencies": {
      "book3": ["book2"]
    }
  },
  "render": {
    "pageHeadingStyle": "label-title"
  }
}
```

整合时要让目标项目 AI 明白这些边界：

- `npm run formal` 应从拥有 `.markdown-formal/` 的 formal root 执行。
- 根目录扫描时，构建产物、上下文目录、草稿目录、外部证明工程等必须写入 `scan.exclude`。
- 定义搜索和当前页符号表默认只在当前 book 内生效；跨 book 查询和跨 book 正文引用必须显式配置依赖。
- 本地 Reader 是唯一支持的阅读界面：用 `npm run formal -- serve .` 启动；它只绑定 `127.0.0.1`、只读、内存扫描。`reader-index.json` 只用于结构检查，不是运行时依赖。

## Release 和 vendoring 边界

如果目标项目从 `markdown-formal` release 接入，应把这段逻辑放进目标项目的工具升级流程：

1. 在 `markdown-formal` 源仓库运行 `npm run release:local`。
2. 核对 `dist/checksums.txt`。
3. 把 release 包里的 `cli/` vendored 到目标项目 `tools/markdown-formal/`。
4. 日常阅读使用 `node tools/markdown-formal/out/cli/formal-tools.js serve .`。
5. 把 release 包里的 `skills/editor.md` 作为 executable 规则输入，不要替代目标项目原生 AI 指令。
6. 在目标项目运行 `npm run formal -- prepare` 和 `npm run formal -- verify`。

`skills-src/integrator.vasm.md` 会生成 `skills/integrator.md` 组合指导 artifact，并通过 release catalog 导出为可锁定 integrative artifact。目标项目如果通过 VASMC 消费，应同时锁定 `editor` 和 `integrator` exports，让 catalog 中的 `appliesTo` 解析为 editor artifact hash，而不是扫描远端仓库或手拷 source。

不要让目标项目 AI 自动拉取远端代码、自动安装未审阅 skill，或在没有 checksum/diff 审阅的情况下更新 vendored 工具。

## 迁移旧项目

把这部分合并到目标项目的迁移工作流：

```bash
npm run formal -- migrate-text-refs path/to/chapter-or-volume
npm run formal -- migrate-text-refs --apply path/to/chapter-or-volume
npm run formal -- migrate-ids path/to/chapter-or-volume
npm run formal -- migrate-ids --apply path/to/chapter-or-volume
```

逐章或逐卷迁移时，默认同步处理 incoming refs：目标范围内按完整 reference map 迁移，目标范围外只处理指向目标范围编号 marker 的旧文字引用。只有明确要把改写限制在目标文件内时才使用 `--target-only`。

`migrate-text-refs` 只自动改写带类型或小节语义的旧编号引用，例如 `定理 2.1`、`命题2.2`、`Theorem 2.1`、`公式 (2.1)`、`Figure 2.1`、`表 2.1`、`§2.1`、`第 2.1 节`。裸 `2.1`、裸 `(2.1)`、`第 2 章` 或 `Chapter 2` 不自动改写，必须由 AI 结合上下文手工判断。手写章引用优先改为目标页的 `@h-...`；目标页没有页面 hash 时，先在唯一最高级标题加 `#tmp-*` 并运行 `finish`，或临时使用 `@chapter:path/to/chapter.md`。

如果 `migrate-ids --target-only` 发现目标范围内旧 ID 被范围外文件引用，工具会拒绝 apply。此时去掉 `--target-only`，或选择更大的闭合范围。

迁移报告会列出旧 Markdown 链接、缺少 hash 的小节标题候选、定义和符号候选。AI 应读取 `.markdown-formal/text-ref-migration.md` 后手工处理这些项。

## 整合验收清单

目标项目接入完成后，应能满足：

- release catalog 中存在 `editor` 和 `integrator` 两个 export，且 `integrator.appliesTo` 指向 editor artifact hash。
- 目标项目 AI 规则能说明何时运行 `prepare`、`finish`、`verify`、`audit` 和图分析命令。
- 目标项目 AI 不会手写真实 hash，只会写 `#tmp-*` 并让工具收口。
- 目标项目 AI 引用已有对象时会从 `reference-map.md` 复制 `@h-...`，不会写 `命题 #h-...`。
- 定义和符号的维护规则被保留，没有退化成“只维护编号”。
- release/vendoring 流程没有自动安装远端 skill 或自动执行未知脚本。
- 小范围试写或迁移后，`npm run formal -- finish <scope>` 和 `npm run formal -- verify` 通过。
