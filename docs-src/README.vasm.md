---
vasm:
  alias: math-workspace-readme
  intent: "Explain math-workspace positioning, installation, basic usage, documentation, release, and checks."
  compile:
    format: informational
    targetLangs: ["en", "zh-CN"]
---

# Math Workspace

![math-workspace banner](media/readme/banner.png)

Math Workspace 是一个本地数学工作区，用于长期维护数学或技术类书稿，并将写作、形式化锚点、审阅和项目导航放在同一个界面中。它可与 Codex 或任意浏览器侧栏并行运行。

`math-workspace` 是 Math Workspace 当前稳定的 Markdown 引擎和 CLI：包名、命令名与 `.math-workspace/` 项目配置保持兼容。工作区的范围面向数学写作、形式化与审阅的完整工作流；除 Markdown 与本地 Math Workspace 外，当前版本也可为配置的 Lean 项目建立稳定锚点索引。

它让源码保存稳定的 hash ID，再由工具渲染面向读者的编号、引用、导航、定义查询、符号表、依赖图和发布产物。

这个项目面向 AI 辅助写作：

- AI 写作时只需要使用轻量的 `tmp-*` 占位。
- CLI 会把临时 ID 固化为稳定的 `h-*` hash。
- 校验工具会检查断裂引用、残留临时 ID 和迁移遗留问题。

### 当前能力

- 章节、页面、小节、命题类对象、公式、图、表的稳定编号。
- `@h-...` 引用可承受插入、删除和章节重排。
- 定义查询不侵入编号系统，并能利用明确命名的概念/术语附录。
- 当前页符号表用于展示项目特有 LaTeX 记号。
- 从显式 `@h-...` 引用生成主线命题与带 hash 补充注释的依赖图。
- 从 Lean docstring 扫描稳定 hash，生成锚点索引、覆盖报告、正文/声明审阅基线、构建记录和直接依赖比对，并在正文和命题图中显示轻量 Lean 锚点徽章。
- Markdown/PDF 导出，支持封面、出版元数据页和前置声明页。
- `skills/` 提供给目标项目 AI 指令融合的规则 artifact；`vasm-catalog/` 提供可由 VASMC 锁定消费的 catalog exports。

### Math Workspace

运行工作区：

```bash
npm run workspace -- serve /path/to/writing-project
```

Math Workspace 只监听 `127.0.0.1`，不写入书稿源码。打开命令打印的 URL 后，可获得章节导航、目录、当前页符号表、定义搜索、命题类对象和带 hash 补充注释旁的显式依赖标记、Lean 锚点徽章、引用回溯和源文件实时刷新。多卷结构会自然折叠成卷到章的导航层级。点击正文中的 Lean 徽章可查看锚定声明、审阅基线、最近构建与直接依赖比对；它们都只反映可审计的工程状态，不表示完整形式化或证明覆盖。

正文或公式选区可通过“交给 Codex”生成短期 `mwsel_...` 交接引用，并自动复制一条紧凑提示。把它粘贴到所选的原生 Codex 任务后，Codex 会通过 Math Workspace MCP 读取已校验的源码位置、选区、相关 formal 引用和锚点；后续讨论、工具调用、修改与审批全部留在该原生任务历史中。交接记录只保存在本机、按项目根和源码 hash 校验，并在两小时后失效；它不是第二套对话或项目任务状态。

仓库也提供 Codex MCP plugin。它可启动或复用本地 Math Workspace，并提供选区、命题、严格依赖、Lean 对齐和只读校验查询；不嵌入或复制工作区前端，更不维护另一套 Codex 对话逻辑：

```bash
math-workspace mcp
```

安装 plugin 后，Codex 可以调用 `math_workspace` 打开当前 prepared project 或指定章节；也可以调用 `math_workspace_selection_get` 读取粘贴进任务的 `mwsel_...`，以及相应的命题、依赖、Lean 和校验工具。没有绑定项目时则显示本机项目启动台。开发使用 `npm link` 时，确保 `math-workspace` 在 `PATH` 中即可。

![多卷章节导航](media/readme/navigation.png)

![引用 recall 预览](media/readme/recall-preview.png)

正文里的 `@h-...` 引用会渲染为当前编号，并支持按需 recall，保留数学 Markdown 和 LaTeX 的可读性。

### 本地开发安装

安装依赖并构建：

```bash
npm install
npm run build
```

启动 Math Workspace：

```bash
npm run workspace -- serve /path/to/writing-project
```

### 在写作项目中使用

目标项目通常 vendoring CLI，并自己维护 `.math-workspace/` 数据：

```text
tools/math-workspace/
  out/cli/math-workspace.js

.math-workspace/
  config.json
  definitions.json
  symbols.json
  project-analysis.md
```

添加项目脚本：

```json
{
  "scripts": {
    'workspace': "node tools/math-workspace/out/cli/math-workspace.js"
  }
}
```

开始前生成索引：

```bash
npm run workspace -- prepare
```

编辑文件或目录后固化 ID 并刷新缓存：

```bash
npm run workspace -- finish path/to/chapter-or-dir
```

`finish` 已执行校验。只有直接使用 `finalize`、执行迁移，或需要独立 release 门禁时，再运行：

```bash
npm run workspace -- verify
```

Math Workspace 需要项目根目录存在 `.math-workspace/config.json`，可由 `prepare` 创建。它每次在内存中扫描当前状态；`workspace-index.json` 仅是可检查的结构化快照，不是 Math Workspace 的运行时前提。

如果通过 npm 使用 CLI：

```bash
npm install -D math-workspace
```

```json
{
  "scripts": {
    'workspace': "math-workspace"
  }
}
```

### AI artifacts

`math-workspace` 不提供自动安装的远端 skill。AI 接入时只读 release 或 npm 包里的可审阅 artifact：

- 裸 AI / 普通项目：读取 `skills/editor.md`、`skills/integrator.md`；项目使用 Lean 时再读取 `skills/lean-formalization.md`，然后把规则融合进目标项目原生 `AGENTS.md`、写作 skill 或项目指南。
- VASMC 项目：通过 `vasm-catalog/vasmc-catalog.yaml` 锁定 `editor`、`integrator` 和按需使用的 `lean-formalization` exports。
- npm 项目：对应路径是 `node_modules/math-workspace/skills/` 和 `node_modules/math-workspace/vasm-catalog/`。

CLI 可以打印当前安装位置：

```bash
npm run workspace -- paths
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
- 定义不加 hash。标准 `定义（术语）：...` / `Definition (Term): ...`，以及明确命名的概念/术语附录，会由工具自动扫描。
- `.math-workspace/project-analysis.md` 是生成的知识页摘要，不是手工源；Math Workspace 会随内容变化在内存中重建它。
- AI 只为例外定义维护 `.math-workspace/definitions.json`。
- 只有发生显式语义变化的项目特有符号约定进入 `.math-workspace/symbols.json`。

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
- [skills/lean-formalization.md](skills/lean-formalization.md)：Lean 锚定与验证规则。

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

`cli/` 包含目标项目本地 vendoring 所需的 CLI 和 Math Workspace 静态资源，npm 包用于安装 `math-workspace` CLI。`skills/` 包含需要审阅和融合的 AI artifact。通过 VASMC 接入时，优先使用 `vasm-catalog/vasmc-catalog.yaml` 并让 consumer lockfile 固定 hash。

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
npm run workspace -- perf-dummy 50 200 --max-ms 2000 --max-heap-mb 256
```

```bash
npm audit --registry=https://registry.npmjs.org --omit=optional
```

构建后的 Math Workspace 和 CLI 运行时保持无 npm 运行时依赖。开发依赖只用于 TypeScript、Vite 打包和 Markdown/LaTeX 渲染。
