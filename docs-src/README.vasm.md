---
vasm:
  alias: markdown-formal-readme
  intent: "Explain markdown-formal positioning, installation, basic usage, documentation, release, and checks."
  compile:
    format: informational
    targetLangs: ["en", "zh-CN"]
---

# markdown-formal

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
