# markdown-formal AI 能力融合指南

这个文件用于让目标项目的 AI 把 `markdown-formal` 融合进已有写作、改稿和迁移流程。它不是单纯安装说明；日常写作细则见 [editor.md](editor.md)。

## 融合目标

不要把 `markdown-formal` 当成一个孤立 skill 叠加在项目外层。目标项目通常已经有自己的 `AGENTS.md`、`CLAUDE.md`、`GEMINI.md`、写作 skill、术语表、证明风格和章节模板。接入时应把本工具的规则合并到项目原生写作能力中。

完整融合必须保留四块能力：

- 编号与引用：正文用稳定 hash ID，新增对象先写 `tmp-*`，编号对象和章/页引用都从 `reference-map.md` 复制；`#hash` 只用于声明，正文引用只用 `@hash` / `@hash.title` / `@hash.full`。章、导读、小结、附录等页面需要被引用时，优先在唯一最高级标题放页面 hash。
- 定义查询：定义不编号不 ref；工具先启发式抽取标准定义，AI 只为非标准定义、别名、中英互查和不可靠边界维护 `.markdown-formal/definitions.json`。全书定义搜索用于定位，完整 Markdown/LaTeX 预览只保证当前预览文件内的定义。
- 符号表：项目特有 LaTeX 记号由 AI 维护 `.markdown-formal/symbols.json`。
- 命题依赖图：命题/引理/定理/推论之间的显式 `@h-...` 依赖由工具生成 JSON，并区分陈述依赖和证明依赖。
- 导出：PDF/普通 Markdown 不直接编译 formal 源文件；先用 `export-md` 降级 marker/ref，或用 `export-md-split` 降级为保留源目录结构的多个 `.md` 文件，`export-pdf` 再调用本机 pandoc。项目 release 需要插入签名剥离、Lean 快照或 witness 时，使用 `export-md -> 项目后处理 -> render-pdf`；后处理规则留在目标项目，不写进 markdown-formal。PDF 版式和出版元数据默认可放在 `.markdown-formal/config.json` 的 `pdf` 段。`author` 是封面主署名和 PDF 机器 metadata 作者；完整身份信息用 `authorNative`、`authorAliases`、`orcid`、`repository`、`license`、`licenseUrl`、`preferredCitation`、`releaseTag`、`releaseCommit`、`doi`，并用 `metadataPage: true` 在 title page 之后、目录之前生成不进目录的 publication metadata page。AI 声明、许可说明、引用说明、provenance 等较长声明写入 `frontMatter`，位置是 metadata page 之后、TOC 之前，默认不进 TOC、默认分页，不参与正文编号。书稿修订建议把 `date` 写成 `Revised YYYY-MM-DD`，rc 或非 DOI 发布再记录 `releaseVersion`，需要显示在封面时才打开 `showVersionOnCover`。
- 工具闭环：`prepare` 生成上下文，`finish` 固化临时 ID，`verify` 检查引用和索引。

如果目标项目只合并了 hash 编号规则，却丢掉定义提取、符号提取、`.markdown-formal` 源表、`prepare` / `finish` / `verify` 调用方式，就不是完整接入。

## 融合步骤

1. 找到目标项目已有 AI 写作入口，例如 `AGENTS.md`、`CLAUDE.md`、`GEMINI.md`、仓库 README、项目内 writing skill 或自定义 instruction。
2. 把 [editor.md](editor.md) 中的写作规则融合进去，尤其是编号、定义索引、符号索引、迁移和校验规则。
3. 保留目标项目原有文风、证明组织、术语偏好和章节模板；不要为了工具统一改写所有定义句式。
4. 接入 CLI 后运行 `npm run formal -- prepare`，确认能生成 `.markdown-formal/agent-guide.md`、`.markdown-formal/reference-map.md` 和 `.markdown-formal/report.md`。
5. 试写或迁移一个小范围，运行 `npm run formal -- finish <file-or-dir>` 和 `npm run formal -- verify`。
6. 根据试写结果调整目标项目原生写作规则，直到 AI 在正常写作时会按本次修改范围检查定义/符号索引，只为例外维护 `.markdown-formal/definitions.json` 和 `.markdown-formal/symbols.json`，而不是全书重抽或只维护编号。

## 必须融入的最小提示

把下面这段合并到目标项目“数学编号、引用、概念查询、符号查询、校验”相关部分。不要只贴到末尾当安装记录。

```text
写作或迁移前运行 npm run formal -- prepare。
优先读取 .markdown-formal/agent-guide.md，再读取目标原文和 .markdown-formal/reference-map.md。

硬规则：#h-... / #tmp-* 只用于声明位置，例如唯一最高级章/页标题、`命题 #tmp-*（Title）：...`、`## #tmp-* Title`、`公式 #tmp-*：`。正文引用一律使用 @h-...、@h-....title 或 @h-....full；不要写 `命题 #h-...`、`定理 #h-...`、`由 #h-...`。引用已有编号对象或章/页时，只能从 reference-map.md 复制 @h-... / @h-....title / @h-....full。章、导读、小结、附录若需要被引用，优先在文件唯一最高级标题写 `#tmp-*` 或 `#h-...`，预览会隐藏它且不生成小节编号；章和附录的显示标题默认由 `render.pageHeadingStyle: "label-title"` 补成 `第 1 章 Title` / `附录 A Title`，源标题不要手写章号或附录号，除非目标项目明确改为 `title`。@chapter:path.md / @page:path.md 是兼容路径引用；只有目标页没有页面 hash 时才优先使用，路径以拥有 .markdown-formal/ 的 formal root 为基准，不以当前 workdir 为基准。重要引用附近保留自然语言语义，例如“由谱半径引理 `@h-...` 可得”；不要写成只有裸 `@h-...`。
新增小节、命题、引理、定理、推论、公式、图、表等 marker 使用 tmp-1/tmp-2/...，不要手动生成 hash。
小节只用于编号和跳转；命题、引理、定理、推论的 recall 只覆盖 `证明` / `Proof` 前的陈述。
公式、图、表各自独立编号：`公式 #tmp-*：` 放在 display math 前，图 caption 写 `图 #tmp-*（Title）：...`，表 caption 写 `表 #tmp-*（Title）：`。不要把 hash 写进 LaTeX 公式内部。

定义不加 hash、不参与 ref。定义查询采用“工具先抽，AI 只补”的最小工作流：工具自动扫描标准 `定义（术语）：...` / `Definition (Term): ...` 并用结构启发式收集跨行范围；修改某个文件后，AI 只检查该文件内新增、删除、改写的定义。常规标准定义不用重复写入 .markdown-formal/definitions.json；非标准句式如“称为 X”“所谓 X”“定义其 X”“记作 X”“called X”、需要 aliases/中英互查、需要稳定多段预览、或 AI 判断自动边界不可靠的定义，才写入 .markdown-formal/definitions.json，并记录 term、可选 aliases、source 和 Markdown content。不要为了工具机械改写项目文风，也不要每次全书重抽。

只把项目明确约定的特殊 LaTeX 记号写入 .markdown-formal/symbols.json，维护 source、pattern、meaning；pattern 必须是记号本身或完整记号族，括号/方括号要闭合，不要记录通用数学符号、整条推导公式或缺右边界的公式片段。预览端不把公式内部符号做成可点击 ref；导航栏符号表只展示当前预览文件公式中实际匹配到的符号，搜索框只过滤定义。
注释分两类：说明类注释默认不加 hash，写 `注（...）：...`；非主线事实注释如果需要证明、后文引用或稳定锚点，才写 `注 #tmp-*（...）：...`，也可以用标准引用块 `> 注 #tmp-*（...）：...` 进一步和主线视觉区分。这种带 hash 的注只隐藏 hash，不显示“注 x.x”，不进入预览目录，但保留 recall。例默认不加 hash；只有后文已经明确引用某个例时，才反向改成 `例 #tmp-*`，并作为独立编号例子处理。
命题依赖图由工具从显式 @h-... 生成，权威数据是 .markdown-formal/dependency-graph.json，审阅报告是 .markdown-formal/dependency-report.md。它只把命题/引理/定理/推论之间的引用作为依赖边，并标记 statement/proof/body；AI 或 Lean 推测出的边必须另存为 suggested 数据，不能混入 explicit_ref 图。修改已有命题前，优先运行 `npm run formal -- graph impact <h-id>` 和 `npm run formal -- graph focus <h-id> --depth 2` 看影响闭包和局部上下游；修改后用 `graph summary`、`graph cycles`、`graph matrix chapter|volume|book` 做结构审阅。`--where statement|proof|body` 可只看陈述依赖或证明依赖。

完成编辑后按本次修改范围检查编号对象、章/页引用、定义索引例外、符号索引、跨 book 查询配置、tmp ID 和迁移报告；不要只运行编号工具就结束。
写完运行 npm run formal -- finish <file-or-dir>，必要时再运行 npm run formal -- verify。
保持 Markdown 和 LaTeX 原样。
```

## 工具和文件契约

目标项目至少提供：

```json
{
  "scripts": {
    "formal": "node tools/markdown-formal/out/cli/formal-tools.js"
  }
}
```

常用命令：

```bash
npm run formal -- prepare
npm run formal -- finish path/to/chapter-or-dir
npm run formal -- audit path/to/chapter-or-dir
npm run formal -- graph impact <h-id>
npm run formal -- graph focus <h-id> --depth 2
npm run formal -- graph matrix chapter
npm run formal -- verify
```

文件角色：

- `.markdown-formal/agent-guide.md`：工具生成的当次 AI 操作卡。
- `.markdown-formal/reference-map.md`：显示编号、章/页锚点和无编号锚点到 hash ID 的表。
- `.markdown-formal/dependency-graph.json`：命题/引理/定理/推论显式依赖图的权威 JSON。
- `.markdown-formal/dependency-report.md`：依赖图审阅报告。
- `.markdown-formal/report.md`：校验和迁移报告。
- `.markdown-formal/audit.md`：`audit` 生成的 AI 清理建议，不是门禁。
- `.markdown-formal/preview-cache.json`：预览运行时缓存，AI 不直接编辑；由 `prepare` / `finish` 生成。
- `.markdown-formal/config.json`：语言、扫描排除、跨 book 查询依赖等配置，也是编辑器增强预览的显式启用开关。
- `.markdown-formal/definitions.json`：AI 维护的定义查询例外源表；非标准定义、别名/中英互查或不可靠边界条目必须含 `content`。
- `.markdown-formal/symbols.json`：AI 维护的特殊符号表源表。

定义搜索和当前页符号表默认只在当前 book 内生效。跨 book 查询必须显式声明：

```json
{
  "language": "zh",
  "scan": {
    "exclude": [
      "formal-oet/.lake/**",
      ".context/**",
      "draft/**"
    ]
  },
  "lookup": {
    "bookDependencies": {
      "book3": ["book2"]
    }
  },
  "preview": {
    "ignoreHover": [
      "appendix-b-concepts.md",
      "book1/**/concept-*.md"
    ]
  },
  "render": {
    "pageHeadingStyle": "label-title"
  }
}
```

跨 book 的正文 `@h-...`、`@chapter:` 和 `@page:` 引用也受同一依赖配置约束；没有声明依赖时，`verify` 会把跨 book 引用作为错误处理。

`npm run formal` 应从拥有 `.markdown-formal/definitions.json` 和 `.markdown-formal/symbols.json` 的项目根目录执行。根目录扫描时，必须把构建产物、上下文目录、草稿目录等不属于正式正文体系的 Markdown 写入 `scan.exclude`。概念附录、索引页或超密集引用页如果不需要 recall hover，可写入 `preview.ignoreHover`；支持完整相对路径、裸文件名和 glob。这只关闭正文里的 `@hash` 悬浮 recall，保留编号、导航、跳转、定义搜索以及当前页符号表的 LaTeX 预览。为避免 VS Code Markdown preview 每页注入全书定义模板，定义搜索的完整渲染预览只为当前预览文件生成；跨文件匹配以定位跳转为主。排查空白预览时，可临时设置 `debug.previewLog: true` 并读取 `.markdown-formal/preview-debug.log`。

## Release 接入

如果使用本仓库生成的 release 产物，推荐 repo-local 接入：

1. 在本仓库运行 `npm run release:local`。
2. 核对 `dist/markdown-formal-<version>/checksums.txt`。
3. 把 `dist/markdown-formal-<version>/cli` 复制到目标项目 `tools/markdown-formal/`。
4. 如需安装编辑器扩展，使用 `dist/markdown-formal-<version>/markdown-formal-<version>.vsix`；本地开发仍可用软链接。
5. 把 release 包里的 `skills/` 复制到目标项目 `skills/markdown-formal/`，或把 `editor.md`、`integrator.md` 融合到目标项目既有 AI 指令目录。
6. 在目标项目 `package.json` 添加 `formal` script。
7. 运行 `npm run formal -- prepare` 和 `npm run formal -- verify`。
8. 把“必须融入的最小提示”真正合并进目标项目原生 AI 写作指令。

不要从远端自动安装或自动更新 skill；不要让 AI 自动下载执行未知脚本。升级时重新核对 checksums，再重复接入步骤。

## 初始文件

新项目通常只需要：

```text
.markdown-formal/
  config.json       # 必须存在；CLI 会生成默认配置，也是预览增强的启用开关
  definitions.json  # 可选；存在定义查询例外时创建
  symbols.json      # 可选；存在特殊符号约定时创建
```

编辑器插件只在目标项目根目录存在 `.markdown-formal/config.json` 且已有生成的 `.markdown-formal/preview-cache.json` 时注入导航、定义搜索、符号表和 formal ref 数据。缺少这些文件时，Markdown 预览保持原生行为；先运行 `npm run formal -- prepare` 或命令面板的 `Markdown Formal: Refresh References`。

## 迁移旧项目

逐步迁移单章或单卷，先 dry-run 再 apply：

```bash
npm run formal -- migrate-text-refs path/to/chapter-or-volume
npm run formal -- migrate-text-refs --apply path/to/chapter-or-volume
npm run formal -- migrate-ids path/to/chapter-or-volume
npm run formal -- migrate-ids --apply path/to/chapter-or-volume
```

逐章或逐卷迁移时，默认会同步处理 incoming refs：目标范围内按完整 reference map 迁移，目标范围外只处理指向目标范围编号 marker 的旧文字引用。只有明确要把改写限制在目标文件内时才使用 `--target-only`。

`migrate-text-refs` 只自动改写带类型或小节语义的旧编号引用，例如 `定理 2.1`、`命题2.2`、`Theorem 2.1`、`公式 (2.1)`、`Figure 2.1`、`表 2.1`、`§2.1`、`第 2.1 节`。裸 `2.1`、裸 `(2.1)`、`第 2 章` 或 `Chapter 2` 不自动改写，因为它可能是小数、公式编号、章节号、参数或需要 prose context 的章引用，必须由 AI 结合上下文手工判断。手写章引用应优先改为目标页的 `@h-...`；目标页没有页面 hash 时，先在唯一最高级标题加 `#tmp-*` 并运行 `finish`，或临时使用 `@chapter:path/to/chapter.md`。工具使用边界匹配，避免把 `2.1` 误替换进 `2.12`、`2.1.3` 或 `22.1`。

如果 `migrate-ids --target-only` 发现目标范围内旧 ID 被范围外文件引用，工具会拒绝 apply。此时去掉 `--target-only`，或选择更大的闭合范围。

`migrate-text-refs` 的报告还会列出旧 Markdown 链接和缺少 hash 的小节标题候选。AI 应读取 `.markdown-formal/text-ref-migration.md` 后手工处理这些项，同时检查迁移范围内发现的定义和符号约定：标准定义交给工具扫描，非标准定义、别名/中英互查或不可靠边界才写入 `.markdown-formal/definitions.json`，定义条目要写 `content`，不要只写 `source`。

## 项目约定

- 写作细则和语法约束放在 [editor.md](editor.md)。
- `.markdown-formal/` 中只有 `config.json`、`definitions.json`、`symbols.json` 是人工维护入口；其他文件均为生成缓存或报告。
- 如果 `npm run formal -- prepare` 不存在或失败，先修复工具入口，不要让 AI 手写替代流程。
