# markdown-formal integrative 组件

这是组合指南，不是应原样附加到目标项目末尾的 prompt。把 [editor.md](../skills/editor.md) 的规则拆入目标项目既有的写作、迁移、审阅和发布流程；目标项目自己的术语、证明风格、章节模板和 release 规则仍是主导。

## 整合前

1. 读取目标项目的 AI 指令入口、写作样例和 `package.json` scripts。
2. 读取 `editor.md`、已有 `.markdown-formal/config.json` 和目标项目的写作样例。已有对象要被引用时，只读取 `reference-map.md` 的相关行；`agent-guide.md` 仅作为当前索引状态的补充卡片。
3. 若项目尚未初始化，先接入 CLI 并运行：

```bash
npm run formal -- prepare
```

不要自动下载、安装或更新远端 skill；以已审阅的 release/npm/VASMC artifact 为输入，并在目标项目中融合规则。

## 必须融入的规则

- 稳定编号：源码保存稳定 `#h-...`，新增对象先写 `#tmp-*`；正文引用只用 `@h-...`、`@h-....title` 或 `@h-....full`，读者编号由工具渲染。
- 定义查询：定义不加 hash、不参与 ref；工具自动扫描标准 `定义（术语）：...` / `Definition (Term): ...`，并在发现概念/术语附录时利用其表格和末级条目建立补充索引。AI 只为查询缺失、非标准定义、别名、中英互查和不可靠边界维护 `.markdown-formal/definitions.json`。
- 项目知识：`.markdown-formal/project-analysis.json` / `.markdown-formal/project-analysis.md` 是工具生成的概念附录、符号附录和 summary 页面摘要；Reader 在内存中按内容变化重建，并把同 book 来源交给任务讨论。
- 符号表：`.markdown-formal/symbols.json` 只记录项目明确约定且发生语义变化的特殊 LaTeX 记号，不索引通用变量、完整推导公式或一次性符号。
- 依赖图：命题/引理/定理/推论与带 hash、可证明的补充注释之间的显式依赖来自 `@h-...`，权威数据是 `.markdown-formal/dependency-graph.json`；普通 `注（...）` 不进入图。AI 或证明器推测出的边必须另存为 suggested 数据。
- 导出：普通 Markdown/PDF 不直接消费 formal 源；先用 `export-md` 或 `export-md-split` 降级 marker/ref，项目级后处理之后再用 `render-pdf`。
- 工具闭环：进入任务或索引可能过期时运行 `prepare`，普通编辑后运行 `finish <file-or-dir>`（它会校验）；仅在直接 `finalize`、执行迁移或独立 release 门禁时另行运行 `verify`。

把以下能力分别放进目标项目相应动作，而不是只贴一个独立 skill：

- **写作与引用**：新编号对象用 `#tmp-*` 声明，正文只用 `@h-...`；已有 ID 从目标正文或 `reference-map.md` 的相关行复制；通常完成时只运行 `finish`，它会校验。直接 `finalize`、迁移或 release 门禁才另行 `verify`。
- **数学文风**：定义不加 hash；说明类注与普通例默认不加 hash；有证明、稳定锚点或后文实际引用时才为注/例添加 hash。带 hash 的注是未编号的补充事实节点，普通注不进入依赖图。
- **项目知识**：工具自动抽标准定义和明确命名的概念/术语附录；`project-analysis.md` 是按需读取的派生摘要。AI 仅为缺失、别名/双语或不可靠边界维护 definitions override。
- **符号**：只有项目明确新增或改写特殊记号语义时维护经审阅的符号源表；不索引普通变量或整条公式。
- **结构审阅**：依赖图只来自显式 `@h-...`，覆盖主线命题类对象与带 hash 的补充注释；报告分开统计两层。需要时将 `graph impact`、`focus`、`cycles` 或 `matrix` 接入审阅流程。AI/Lean 推测边须单独存放。
- **项目边界**：formal root 配置 `scan.exclude`；跨 book 引用或查询显式配置 `lookup.bookDependencies`。

## 可融合的最小片段

```text
进入任务或索引可能过期时运行 npm run formal -- prepare，并读取目标原文。需要当前上下文外的既有对象时，再从 .markdown-formal/reference-map.md 读取匹配行。
新小节、命题、引理、定理、推论、公式、图、表和需要锚定的旁支事实用 #tmp-* 声明；正文引用只用 @h-... / @h-....title / @h-....full，不手写显示编号。
定义不加 hash。工具自动维护标准定义与明确命名的概念/术语附录索引；不要因普通文本编辑重写 definitions.json。只有查询缺失、别名/双语或边界不可靠时才维护 override。特殊符号只有语义明确变化时才维护 symbols.json。
编辑后运行 npm run formal -- finish <file-or-dir>，保持 Markdown 和 LaTeX 原样；只有直接 finalize、迁移或 release 门禁才另行运行 verify。
```

## 人工源与派生数据

- 可人工维护：`.markdown-formal/config.json`、必要时的 `definitions.json` 与 `symbols.json`。
- 工具派生：`agent-guide.md`、`reference-map.md`、`reader-index.json`、`project-analysis.*`、依赖图和报告。可读，不作为手工源。
- Reader 是只读的本地服务；它按内容变化重建索引与项目知识。它向 Codex 讨论提供当前选区、路径、行范围、直接引用和当前 book 的知识来源，而不会主动写源文档。

## 完成标准

- 目标项目原生 AI 指令已吸收上述规则，不是简单堆叠外来 prompt。
- `prepare`、`finish`、`verify` 可运行；新 ID 能稳定生成，断裂引用会被发现。
- 概念/术语附录存在时会在 `project-analysis.md` 中被识别；没有时不要求人工制造概念表。
- 定义和符号不参与 theorem-like 编号；跨 book 边界被显式配置。
- VASMC 消费者同时锁定 `editor` 与 `integrator` catalog exports；release/vendored 升级经过 checksum 与 diff 审阅。

完整迁移、PDF 和发布流程见 `docs/usage.md` 与 `docs/release.md`。
