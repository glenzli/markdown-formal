# AI Integration

[🌍 English](#en) | [🇨🇳 中文](#zh-cn)

---

<a name="en"></a>

## 🌍 English

`markdown-formal` should be integrated into a project's existing AI writing workflow.

The files in `skills/` are not executable installers. They are reviewed AI artifacts for a target project's agent instructions. When consuming through VASMC, prefer locking the `editor` and `integrator` exports from the release `vasm-catalog/vasmc-catalog.yaml`.

### Integration Principle

Do not add `markdown-formal` as an isolated extra skill if the target project already has writing rules.

Instead, merge the rules into the project's native guidance:

- `AGENTS.md`
- `CLAUDE.md`
- `GEMINI.md`
- a project writing skill
- a project style guide
- repository release instructions

The target project should still sound like itself. `markdown-formal` only supplies the numbering, lookup, symbol, graph, and verification workflow.

### What Must Be Preserved

- Stable numbering: source stores stable `#h-...` markers, new objects start as `#tmp-*`, prose references use only `@h-...`, `@h-....title`, or `@h-....full`, and reader-facing numbers are rendered by the tool.
- Definition lookup: definitions do not get hash IDs or refs; the tool scans standard `定义（术语）：...` / `Definition (Term): ...` entries, and AI maintains `.markdown-formal/definitions.json` only for nonstandard definitions, aliases, bilingual lookup, and unreliable boundaries.
- Symbol table: `.markdown-formal/symbols.json` records only project-defined special LaTeX notation, not generic variables, complete derivations, or one-off symbols.
- Dependency graph: explicit theorem-like dependencies come from `@h-...`; the canonical data is `.markdown-formal/dependency-graph.json`; AI- or prover-suggested edges must be stored separately as suggested data.
- Export: ordinary Markdown/PDF does not consume formal source directly; use `export-md` or `export-md-split` to lower markers/refs first, then run project-specific postprocessing and `render-pdf`.
- Tool loop: run `prepare` before writing or migration, `finish <file-or-dir>` after editing, and `verify` before committing generated or migrated content.

### Minimal Project Prompt

Use this as the smallest merged instruction:

```text
Before writing or migrating formal Markdown, run npm run formal -- prepare.

Read:
- .markdown-formal/agent-guide.md
- .markdown-formal/reference-map.md
- the target source file

#h-... and #tmp-* are declarations only.
Prose references must use @h-..., @h-....title, or @h-....full copied from reference-map.md.

Use tmp-1/tmp-2/... for new declarations.
Do not generate hash IDs manually.

Definitions do not get hash IDs.
The tool scans standard Definition (Term) / 定义（术语） ranges.
Only update .markdown-formal/definitions.json for nonstandard definitions, aliases, bilingual lookup, or unreliable boundaries in the edited files.

Only project-specific LaTeX notation goes into .markdown-formal/symbols.json.
Do not index generic variables or complete formulas.

After editing, run npm run formal -- finish <file-or-dir>.
For larger changes, also run npm run formal -- verify and relevant graph commands.
```

### Target Project Layout

Vendor the CLI:

```text
tools/markdown-formal/
  out/cli/formal-tools.js
  package.json

.markdown-formal/
  config.json
  definitions.json
  symbols.json
```

Add the project script:

```json
{
  "scripts": {
    "formal": "node tools/markdown-formal/out/cli/formal-tools.js"
  }
}
```

Initialize generated metadata:

```bash
npm run formal -- prepare
```

Run the strict gate:

```bash
npm run formal -- verify
```

### Release Upgrade Workflow

When upgrading `markdown-formal` in a target project:

1. Review the release bundle.
2. Verify `checksums.txt`.
3. Copy the new `cli/` into `tools/markdown-formal/`.
4. Merge any changed `skills/` artifacts into project-native instructions, or consume them through a VASMC catalog dependency and lockfile.
5. Run `npm run formal -- prepare`.
6. Run `npm run formal -- verify`.
7. Run project-specific release checks.

Do not silently fetch or execute remote skill updates.

---

<a name="zh-cn"></a>

## 🇨🇳 中文

`markdown-formal` 应该融合到目标项目已有的 AI 写作流程中。

`skills/` 里的文件不是可执行安装器，而是给目标项目审阅和整合的 AI artifact。通过 VASMC 使用时，应优先从 release 的 `vasm-catalog/vasmc-catalog.yaml` 锁定 `editor` 和 `integrator` exports。

## 融合原则

如果目标项目已经有自己的写作规则，不要把 `markdown-formal` 当成孤立的额外 skill 叠在外面。

更好的方式是把规则融合进项目原生入口：

- `AGENTS.md`
- `CLAUDE.md`
- `GEMINI.md`
- 项目写作 skill
- 项目风格指南
- 仓库 release 指令

目标项目的文风和证明组织仍应保持原样。`markdown-formal` 只提供编号、查询、符号表、依赖图和校验流程。

## 必须保留的能力

- 稳定编号：源码保存稳定 `#h-...`，新增对象先写 `#tmp-*`；正文引用只用 `@h-...`、`@h-....title` 或 `@h-....full`，读者编号由工具渲染。
- 定义查询：定义不加 hash、不参与 ref；工具自动扫描标准 `定义（术语）：...` / `Definition (Term): ...`，AI 只为非标准定义、别名、中英互查和不可靠边界维护 `.markdown-formal/definitions.json`。
- 符号表：`.markdown-formal/symbols.json` 只记录项目明确约定的特殊 LaTeX 记号，不索引通用变量、完整推导公式或一次性符号。
- 依赖图：命题/引理/定理/推论之间的显式依赖来自 `@h-...`，权威数据是 `.markdown-formal/dependency-graph.json`；AI 或证明器推测出的边必须另存为 suggested 数据。
- 导出：普通 Markdown/PDF 不直接消费 formal 源；先用 `export-md` 或 `export-md-split` 降级 marker/ref，项目级后处理之后再用 `render-pdf`。
- 工具闭环：写作或迁移前运行 `prepare`，编辑后运行 `finish <file-or-dir>`，提交生成或迁移内容前运行 `verify`。

## 最小项目提示

可把下面这段融合到目标项目 AI 指令中：

```text
写作或迁移 formal Markdown 前，运行 npm run formal -- prepare。

读取：
- .markdown-formal/agent-guide.md
- .markdown-formal/reference-map.md
- 目标源码文件

#h-... 和 #tmp-* 只用于声明位置。
正文引用必须使用从 reference-map.md 复制的 @h-...、@h-....title 或 @h-....full。

新增声明使用 tmp-1/tmp-2/...。
不要手动生成 hash ID。

定义不加 hash。
工具会扫描标准 Definition (Term) / 定义（术语）范围。
AI 只为本次编辑文件里的非标准定义、别名、中英互查或不可靠边界更新 .markdown-formal/definitions.json。

只有项目特有 LaTeX 记号进入 .markdown-formal/symbols.json。
不要索引通用变量或完整公式。

编辑后运行 npm run formal -- finish <file-or-dir>。
较大修改还要运行 npm run formal -- verify 和相关 graph 命令。
```

## 目标项目结构

vendoring CLI：

```text
tools/markdown-formal/
  out/cli/formal-tools.js
  package.json

.markdown-formal/
  config.json
  definitions.json
  symbols.json
```

添加项目脚本：

```json
{
  "scripts": {
    "formal": "node tools/markdown-formal/out/cli/formal-tools.js"
  }
}
```

初始化生成数据：

```bash
npm run formal -- prepare
```

运行严格校验：

```bash
npm run formal -- verify
```

## Release 升级流程

目标项目升级 `markdown-formal` 时：

1. 审阅 release 包。
2. 校验 `checksums.txt`。
3. 把新的 `cli/` 复制到 `tools/markdown-formal/`。
4. 把变化后的 `skills/` artifact 融合进项目原生 AI 指令；如果项目使用 VASMC，则通过 catalog dependency 和 lockfile 接入。
5. 运行 `npm run formal -- prepare`。
6. 运行 `npm run formal -- verify`。
7. 运行项目自己的 release 检查。

不要静默拉取或执行远程 skill 更新。
