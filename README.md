# markdown-formal

[🌍 English](#en) | [🇨🇳 中文](#zh-cn)

---

<a name="en"></a>

## 🌍 English

![markdown-formal banner](media/readme/banner.png)

`markdown-formal` is a local Reader service and CLI for long-form mathematical and technical writing. It can run beside Codex or in any browser side panel; the VS Code preview remains only as an optional legacy compatibility package.

It keeps stable hash IDs in source Markdown, then renders human-facing numbering, references, navigation, definition lookup, symbol tables, dependency graphs, and publication exports from generated metadata.

The design target is AI-assisted editing:

- AI writes lightweight `tmp-*` markers while drafting.
- The CLI finalizes those markers into stable `h-*` IDs.
- Verification catches broken references, stale temporary IDs, and migration residue.

### Main Capabilities

- Stable numbering for pages, sections, theorem-like blocks, equations, figures, and tables.
- `@h-...` references that survive insertion, deletion, and chapter reordering.
- Definition lookup without forcing definitions into the numbering system.
- Current-page symbol table for project-specific LaTeX notation.
- Explicit theorem dependency graph built from `@h-...` references.
- Markdown and PDF export with title page, publication metadata page, and front matter pages.
- Reviewed AI workflow artifacts in `skills/`, plus VASMC catalog exports for lockable reuse.

### Local Reader

```bash
npm run formal -- serve /path/to/writing-project
```

The Reader listens only on `127.0.0.1` and never writes project files. Open the printed URL in Codex's local browser side panel or a normal browser for chapter navigation, a table of contents, current-page symbols, definition search, dependency summaries, recall, and live source refresh.

If the Codex CLI is installed and signed in locally, Reader can open a read-only, ephemeral local discussion for a text or formula selection. Its first message carries the relative path, source line range, selected Markdown, project root, and tool boundary; later messages retain that context. The discussion never writes the manuscript or local task state. You can also bind a Codex task whose working directory exactly matches the Reader project, then explicitly send a chosen discussion conclusion to that task for verification and further work. Reader does not handle Codex tool approvals; continue in Codex when tools are needed.

![Multi-volume chapter navigation](media/readme/navigation.png)

![Reference recall preview](media/readme/recall-preview.png)

Inline `@h-...` references render as current reader-facing numbers and support on-demand recall while preserving readable mathematical Markdown and LaTeX.

### Development Install

Install dependencies and build:

```bash
npm install
npm run build
```

Run the primary interface:

```bash
npm run formal -- serve /path/to/writing-project
```

### Optional Legacy VS Code Package

For projects that still require the embedded VS Code preview, build and link the compatibility package separately:

```bash
npm run build:vscode-extension
```

Link into VS Code:

```bash
ln -s "$PWD/packages/vscode-extension" ~/.vscode/extensions/markdown-formal
```

Link into Antigravity:

```bash
ln -s "$PWD/packages/vscode-extension" ~/.antigravity-ide/extensions/markdown-formal
```

The package retains the existing baseline. New capabilities land in the local Reader first. Reload the editor window after rebuilding.

### Use In A Writing Project

A writing project vendors the CLI and owns its `.markdown-formal/` metadata:

```text
tools/markdown-formal/
  out/cli/formal-tools.js

.markdown-formal/
  config.json
  definitions.json
  symbols.json
```

Add a project script:

```json
{
  "scripts": {
    "formal": "node tools/markdown-formal/out/cli/formal-tools.js"
  }
}
```

Prepare the project:

```bash
npm run formal -- prepare
```

After editing a file or directory:

```bash
npm run formal -- finish path/to/chapter-or-dir
```

Before committing generated or migrated content:

```bash
npm run formal -- verify
```

The Reader requires `.markdown-formal/config.json`, which `prepare` creates. It scans the current project state in memory and does not require or write a preview cache. The legacy VS Code preview still requires `.markdown-formal/preview-cache.json` and leaves ordinary Markdown unchanged when formal configuration is absent.

Install the CLI from npm:

```bash
npm install -D markdown-formal
```

```json
{
  "scripts": {
    "formal": "markdown-formal"
  }
}
```

### AI Artifacts

`markdown-formal` does not provide a remote auto-installed skill. AI integrations should read the reviewed artifacts that ship with the release bundle or npm package:

- Plain AI / ordinary projects: read `skills/editor.md` and `skills/integrator.md`, then merge the rules into the target project's native `AGENTS.md`, writing skill, or project guide.
- VASMC projects: lock the `editor` and `integrator` exports from `vasm-catalog/vasmc-catalog.yaml`.
- npm projects: use `node_modules/markdown-formal/skills/` and `node_modules/markdown-formal/vasm-catalog/`.

The CLI can print paths for the current installation:

```bash
npm run formal -- paths
```

### Minimal Syntax

Use stable IDs where hand-written numbers would normally appear:

```markdown
# #tmp-1 Basic Topology

## #tmp-2 Compactness

Theorem #tmp-3 (Finite Subcover Criterion): Let \(X\) be a compact space.

Proof: ...

By @tmp-3, every open cover has a finite subcover.
```

Rules:

- `#h-...` and `#tmp-*` are declarations only.
- Prose references use `@h-...`, `@h-....title`, or `@h-....full`.
- New declarations use `tmp-1`, `tmp-2`, and so on; `finish` replaces them.
- Definitions do not get hash IDs. Standard `Definition (Term): ...` and `定义（术语）：...` entries are scanned automatically.
- AI maintains `.markdown-formal/definitions.json` only for exceptions.
- Only project-specific notation goes into `.markdown-formal/symbols.json`.

### Documentation

Public documentation sources live in `docs-src/**/*.vasm.md` and are maintained Chinese-first.
Target-project AI skill sources live in `skills-src/**/*.vasm.md`. Generated outputs are
`README.md`, `docs/*.md`, `skills/*.md`, and `vasm-catalog/`. Lockable artifacts for external VASMC consumers are generated from `vasmc-build.yaml` catalog exports.

After changing documentation or skill sources, run:

```bash
npm run content:build -- --dry-run
npm run content:build
```

`--plan` is an alias for `--dry-run`; both only inspect the plan and do not write generated outputs, build-state, or the default report.
For single-file expansion, use `vasmc expand <source> --target-lang zh-CN`; it does not use workspace routing.
Before committing, run `npm run content:build`, read `.vasmc/build-report.yaml`, complete translate or review actions, and commit the generated Markdown.

- [docs/usage.md](docs/usage.md): syntax, commands, project structure, configuration, and PDF export.
- [docs/release.md](docs/release.md): release bundle structure and publishing checks.
- [skills/editor.md](skills/editor.md): detailed AI writing rules.
- [skills/integrator.md](skills/integrator.md): AI composition guidance artifact.

### Release

Build and verify:

```bash
npm test
npm run release:local
npm run release:check
```

Release output:

```text
dist/
  markdown-formal-vscode-extension-<version>.vsix
  vscode-extension/
  cli/
  skills/
  vasm-catalog/
  docs/
  README.md
  LICENSE
  INSTALL.md
  manifest.json
  checksums.txt
```

`cli/` contains the vendorable CLI and Reader assets; the npm package installs the `markdown-formal` CLI. The VSIX and `vscode-extension/` are optional legacy compatibility artifacts. Use `skills/` as reviewed AI workflow artifacts. When consuming through VASMC, prefer `vasm-catalog/vasmc-catalog.yaml` so the consumer lockfile fixes artifact hashes.

Release orchestration:

```bash
npm run release -- --dry-run
npm run release -- --only github,npm
npm run release:github
npm run release:gitlab
npm run release:npm
```

`release:local` only builds `dist/`; `release:check` is the pre-publish gate; `release` orchestrates mixed GitHub/GitLab/npm publishing.

### Checks

```bash
npm test
```

```bash
npm run formal -- perf-dummy 50 200 --max-ms 2000 --max-heap-mb 256
```

```bash
npm audit --registry=https://registry.npmjs.org --omit=optional
```

The Reader, CLI, and legacy extension outputs remain dependency-free after bundling. Development dependencies are pinned for TypeScript, Vite bundling, Markdown/LaTeX rendering, and VSIX packaging.

---

<a name="zh-cn"></a>

## 🇨🇳 中文

![markdown-formal banner](media/readme/banner.png)

`markdown-formal` 是一个本地 Reader 服务和 CLI，用于长期维护数学或技术类 Markdown 书稿。它可与 Codex 或任意浏览器侧栏并行运行；VS Code Preview 仅作为可选的 legacy 兼容包保留。

它让源码保存稳定的 hash ID，再由工具渲染面向读者的编号、引用、导航、定义查询、符号表、依赖图和发布产物。

这个项目面向 AI 辅助写作：

- AI 写作时只需要使用轻量的 `tmp-*` 占位。
- CLI 会把临时 ID 固化为稳定的 `h-*` hash。
- 校验工具会检查断裂引用、残留临时 ID 和迁移遗留问题。

### 主要能力

- 章节、页面、小节、命题类对象、公式、图、表的稳定编号。
- `@h-...` 引用可承受插入、删除和章节重排。
- 定义查询不侵入编号系统。
- 当前页符号表用于展示项目特有 LaTeX 记号。
- 从显式 `@h-...` 引用生成命题依赖图。
- Markdown/PDF 导出，支持封面、出版元数据页和前置声明页。
- `skills/` 提供给目标项目 AI 指令融合的规则 artifact；`vasm-catalog/` 提供可由 VASMC 锁定消费的 catalog exports。

### 本地 Reader

运行 Reader：

```bash
npm run formal -- serve /path/to/writing-project
```

它只监听 `127.0.0.1`，不写入项目文件。打开命令打印的 URL 后，可获得章节导航、目录、当前页符号表、定义搜索、依赖摘要、引用回溯和源文件实时刷新。多卷结构会自然折叠成卷到章的导航层级。

若本机已安装并登录 Codex CLI，Reader 可为正文或公式选区打开只读、临时的本地讨论浮窗。首条消息携带相对路径、源码行范围、选中 Markdown、项目根和可用工具边界；后续消息保留这一上下文。临时讨论不会写入书稿或本机任务状态。也可绑定一个工作目录与当前 Reader 项目完全一致、且可直接接收输入的 Codex 任务，再将某条临时讨论结论显式发送到任务继续核验和执行。Reader 不承接 Codex 的工具审批，需要工具时应回到 Codex 继续。

![多卷章节导航](media/readme/navigation.png)

![引用 recall 预览](media/readme/recall-preview.png)

正文里的 `@h-...` 引用会渲染为当前编号，并支持按需 recall，保留数学 Markdown 和 LaTeX 的可读性。

### 本地开发安装

安装依赖并构建：

```bash
npm install
npm run build
```

启动主界面：

```bash
npm run formal -- serve /path/to/writing-project
```

### 可选 Legacy VS Code 包

如果项目仍需要 VS Code 内嵌预览，单独构建并链接 compatibility package：

```bash
npm run build:vscode-extension
```

链接到 VS Code：

```bash
ln -s "$PWD/packages/vscode-extension" ~/.vscode/extensions/markdown-formal
```

链接到 Antigravity：

```bash
ln -s "$PWD/packages/vscode-extension" ~/.antigravity-ide/extensions/markdown-formal
```

该包保持现有基础功能，但新能力优先实现于本地 Reader。重新构建后 reload editor window。

### 在写作项目中使用

目标项目通常 vendoring CLI，并自己维护 `.markdown-formal/` 数据：

```text
tools/markdown-formal/
  out/cli/formal-tools.js

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

开始前生成索引：

```bash
npm run formal -- prepare
```

编辑文件或目录后固化 ID 并刷新缓存：

```bash
npm run formal -- finish path/to/chapter-or-dir
```

提交生成或迁移内容前运行校验：

```bash
npm run formal -- verify
```

Reader 需要项目根目录存在 `.markdown-formal/config.json`，可由 `prepare` 创建。它每次在内存中扫描当前状态，不依赖或写入 preview cache。legacy VS Code 预览仍需要生成 `.markdown-formal/preview-cache.json`，且在没有 formal 配置时保持原生 Markdown 预览。

如果通过 npm 使用 CLI：

```bash
npm install -D markdown-formal
```

```json
{
  "scripts": {
    "formal": "markdown-formal"
  }
}
```

### AI artifacts

`markdown-formal` 不提供自动安装的远端 skill。AI 接入时只读 release 或 npm 包里的可审阅 artifact：

- 裸 AI / 普通项目：读取 `skills/editor.md` 和 `skills/integrator.md`，然后把规则融合进目标项目原生 `AGENTS.md`、写作 skill 或项目指南。
- VASMC 项目：通过 `vasm-catalog/vasmc-catalog.yaml` 锁定 `editor` 和 `integrator` exports。
- npm 项目：对应路径是 `node_modules/markdown-formal/skills/` 和 `node_modules/markdown-formal/vasm-catalog/`。

CLI 可以打印当前安装位置：

```bash
npm run formal -- paths
```

### 最小语法

把原本需要手写编号的位置替换成稳定 ID：

```markdown
# #tmp-1 基础拓扑

## #tmp-2 紧性

定理 #tmp-3（有限子覆盖判据）：设 \(X\) 为紧空间。

证明：...

由 @tmp-3 可知，每个开覆盖都有有限子覆盖。
```

规则：

- `#h-...` 和 `#tmp-*` 只用于声明位置。
- 正文引用使用 `@h-...`、`@h-....title` 或 `@h-....full`。
- 新增声明使用 `tmp-1`、`tmp-2` 等；`finish` 会替换为正式 hash。
- 定义不加 hash。标准 `定义（术语）：...` 和 `Definition (Term): ...` 会自动扫描。
- AI 只为例外定义维护 `.markdown-formal/definitions.json`。
- 只有项目特有符号约定进入 `.markdown-formal/symbols.json`。

### 文档入口

公开文档的维护源在 `docs-src/**/*.vasm.md`，采用中文优先维护。
目标项目 AI skill 的维护源在 `skills-src/**/*.vasm.md`。生成产物是
`README.md`、`docs/*.md`、`skills/*.md` 和 `vasm-catalog/`。对外给 VASMC 消费的可锁定 artifact 由 `vasmc-build.yaml` 的 `catalog.exports` 生成。

修改文档或 skill source 后运行：

```bash
npm run content:build -- --dry-run
npm run content:build
```

`--plan` 是 `--dry-run` 的别名；二者只查看计划，不写生成物、build-state 或默认 report。需要单文件展开时可用
`vasmc expand <source> --target-lang zh-CN`，它不走 workspace routing。
真正提交前再运行 `npm run content:build`，读取 `.vasmc/build-report.yaml`，
完成 translate 或 review action，再提交生成后的 Markdown。

- [docs/usage.md](docs/usage.md)：语法、命令、项目结构、配置和 PDF 导出。
- [docs/release.md](docs/release.md)：release 包结构和发布检查。
- [skills/editor.md](skills/editor.md)：详细 AI 写作规则。
- [skills/integrator.md](skills/integrator.md)：AI 组合指导 artifact。

### Release

构建并验证：

```bash
npm test
npm run release:local
npm run release:check
```

生成产物：

```text
dist/
  markdown-formal-vscode-extension-<version>.vsix
  vscode-extension/
  cli/
  skills/
  vasm-catalog/
  docs/
  README.md
  LICENSE
  INSTALL.md
  manifest.json
  checksums.txt
```

`cli/` 包含目标项目本地 vendoring 所需的 CLI 和 Reader 静态资源，npm 包用于安装 `markdown-formal` CLI。VSIX 和 `vscode-extension/` 是可选 legacy 兼容产物；`skills/` 包含需要审阅和融合的 AI artifact。通过 VASMC 接入时，优先使用 `vasm-catalog/vasmc-catalog.yaml` 并让 consumer lockfile 固定 hash。

发布编排：

```bash
npm run release -- --dry-run
npm run release -- --only github,npm
npm run release:github
npm run release:gitlab
npm run release:npm
```

`release:local` 只构建 `dist/`；`release:check` 是发布前门禁；`release` 负责 GitHub/GitLab/npm 的混合发布编排。

### 检查

```bash
npm test
```

```bash
npm run formal -- perf-dummy 50 200 --max-ms 2000 --max-heap-mb 256
```

```bash
npm audit --registry=https://registry.npmjs.org --omit=optional
```

构建后的 Reader、CLI 和 legacy 扩展运行时保持无 npm 运行时依赖。开发依赖只用于 TypeScript、Vite 打包、Markdown/LaTeX 渲染和 VSIX 打包。
