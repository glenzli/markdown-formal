---
vasm:
  alias: math-workspace-release
  intent: "Document math-workspace release artifacts, installation, vendoring, skill distribution, checks, and dependency policy."
  compile:
    format: informational
    targetLangs: ["en", "zh-CN"]
---

# Release

`math-workspace` 的 release 包含四类主产物：

- 可 vendoring 的 CLI 与本地 Math Workspace 运行时；
- 面向人的公开文档；
- 需要融合到目标项目的 AI 工作流 artifact；
- 可由 VASMC 锁定消费的 catalog exports。

## 构建

安装依赖：

```bash
npm install
```

运行测试：

```bash
npm test
```

构建 release 包：

```bash
npm run release:local
```

release 包直接输出到 `dist/`；该目录代表当前构建版本：

```text
dist/
```

`dist/` 只表示当前构建结果，不再额外包一层版本目录。版本号保留在 `manifest.json` 和 npm package metadata 中。`vasm-catalog/` 的源码 checkout / npm 发布面位于仓库根目录；release 发布面位于 `dist/vasm-catalog/`。

## Release 结构

```text
dist/
  .agents/plugins/
  cli/
  plugins/
  skills/
  vasm-catalog/
  docs/
  README.md
  LICENSE
  INSTALL.md
  manifest.json
  checksums.txt
```

各产物职责：

- `cli/`：目标项目使用的无运行时依赖 CLI 与内置 Math Workspace 静态资源。
- `.agents/plugins/` 与 `plugins/`：Codex marketplace 与 `math-workspace` MCP plugin。
- `skills/`：AI 规则与组合指导 artifact，包含 `skills/editor.md`、`skills/integrator.md` 和 `skills/lean-formalization.md`。
- `vasm-catalog/`：面向 VASMC consumer 的 catalog，包含 `vasmc-catalog.yaml`、`editor`、`integrator` 和 `lean-formalization` exports。
- `docs/`：面向人的文档。
- `manifest.json`：机器可读产物表。
- `checksums.txt`：SHA-256 校验和。

`docs-src/`、`skills-src/`、`.vasmc/`、`vasmc-build-state.yaml` 等仓库内部
内容源和构建状态不是 release 产物。对外 VASMC 复用必须通过 `vasm-catalog/` 中的 artifact 和 hash，而不是直接扫描这些 source 目录。

## npm 包

npm 包用于安装 CLI、本地 Math Workspace、AI artifacts 和 VASMC catalog：

```bash
npm install -D math-workspace
```

目标项目脚本：

```json
{
  "scripts": {
    'workspace': "math-workspace"
  }
}
```

npm 包入口：

- `bin.math-workspace`：指向 `out/cli/math-workspace.js`。
- `out/reader/`：由 CLI 的 `serve` 命令提供的本地 Math Workspace 静态资源。
- `.agents/plugins/` 与 `plugins/`：Codex marketplace 和 `math-workspace` MCP plugin。
- `skills/`：裸 AI 审阅和融合用的 `editor.md` / `integrator.md` / `lean-formalization.md`。
- `vasm-catalog/`：VASMC consumer 使用的 catalog exports。
- `docs/`：面向人的 usage 和 release 文档。

npm 包由根目录 `package.json.files` 控制包含范围。

使用 npm 包里的 catalog：

```bash
vasmc add --catalog node_modules/math-workspace/vasm-catalog/vasmc-catalog.yaml --export editor --alias math-workspace-editor
vasmc add --catalog node_modules/math-workspace/vasm-catalog/vasmc-catalog.yaml --export integrator --alias math-workspace-integrator
```

## 使用 Math Workspace

在任何包含 `.math-workspace/config.json` 的写作项目根目录运行：

```bash
math-workspace serve .
```

或使用 release vendored CLI：

```bash
node tools/math-workspace/out/cli/math-workspace.js serve .
```

省略项目目录可打开本机启动台，并从系统目录选择器或最近项目中选择目标：

```bash
math-workspace serve
```

命令只监听 `127.0.0.1`，只读扫描项目，并在源文件变化后刷新页面。最近项目记录保存在用户本机状态目录，不写入项目。

## 使用 Codex MCP plugin

release bundle 也包含 Codex marketplace 和 plugin。先安装 bundle 内的 CLI，使 `math-workspace` 位于 `PATH`，再将 release 根目录注册为 marketplace：

```bash
npm install -g ./cli
codex plugin marketplace add /path/to/math-workspace-release
codex plugin add math-workspace@personal
```

plugin 调用 `math-workspace mcp`，可返回在 Codex 内置浏览器直接访问的 localhost URL，也可查询当前讨论标记的源码定位、命题、严格依赖、Lean 对齐与只读校验；它不嵌入或替代 Math Workspace UI，更不维护第二套 Codex 对话。

## Vendoring CLI

把 CLI 复制到目标项目：

```bash
mkdir -p path/to/project/tools/math-workspace
cp -R dist/cli/* path/to/project/tools/math-workspace/
```

目标项目添加脚本：

```json
{
  "scripts": {
    'workspace': "node tools/math-workspace/out/cli/math-workspace.js"
  }
}
```

初始化：

```bash
npm run workspace -- prepare
```

校验：

```bash
npm run workspace -- verify
```

## AI Skill 分发

`skills/` 是可审阅的 AI artifact，不是远程安装器。通过 VASMC 使用时，优先使用 release catalog。

目标项目应该：

1. 审阅 `skills/editor.md`；
2. 审阅 `skills/integrator.md`；
3. 使用 Lean 时审阅 `skills/lean-formalization.md`；
4. 把规则融合进项目原生 AI 指令；
5. 保留目标项目自己的文风和 release 规则。

如果目标项目本身也使用 VASMC，推荐锁定 catalog exports：

```bash
vasmc add --catalog path/to/vasm-catalog/vasmc-catalog.yaml --export editor --alias math-workspace-editor
vasmc add --catalog path/to/vasm-catalog/vasmc-catalog.yaml --export integrator --alias math-workspace-integrator
vasmc add --catalog path/to/vasm-catalog/vasmc-catalog.yaml --export lean-formalization --alias math-workspace-lean-formalization
```

consumer 的 `vasmc-lock.yaml` 会固定 artifact hash；integrative export 的 `appliesTo` 也会被解析为 editor artifact 的 hash。这样目标项目不需要扫描远端仓库，也不需要信任未锁定路径。

## Release 检查

如果修改了 public docs 或 skill，先生成 VASMC 输出：

```bash
npm run content:build -- --dry-run
npm run content:build
```

`--plan` 是 `--dry-run` 的别名；二者只查看计划，不写生成物、build-state 或默认 report；真正 release
前再运行 `npm run content:build`，读取 `.vasmc/build-report.yaml`，完成 pending
的 translate 或 review action，再继续 release 检查。

使用官方 registry 做 npm audit：

```bash
npm audit --registry=https://registry.npmjs.org --omit=optional
```

运行完整测试：

```bash
npm test
```

构建 release：

```bash
npm run release:local
```

检查：

- `dist/manifest.json`
- `dist/checksums.txt`

## 发布编排

`release:local` 只构建本地产物。真正发布到平台时使用发布编排脚本：

```bash
npm run release -- --dry-run
npm run release -- --only github,npm
npm run release -- --skip gitlab
```

快捷命令：

```bash
npm run release:github
npm run release:gitlab
npm run release:npm
```

发布前门禁：

```bash
npm run release:check
```

`release:check` 会检查发布脚本语法、运行 `release:local`、执行 npm pack dry-run，并运行 `git diff --check`。

默认发布目标是：

- `npm`：发布 `math-workspace` npm 包，包内包含 CLI、Math Workspace、Codex MCP plugin、public docs、`skills/` 与 `vasm-catalog/`。
- `github`：推送当前 branch 和 release tag 到 `github` remote，并用 `gh` 创建 GitHub release。
- `gitlab`：推送当前 branch 和 release tag 到 `gitlab` remote，并用 `glab` 创建 GitLab release。

GitHub/GitLab release 会附带：

- `dist/manifest.json`
- `dist/checksums.txt`
- `dist/INSTALL.md`

常用参数：

```bash
npm run release -- --tag v0.1.0
npm run release -- --npm-tag latest
npm run release -- --otp 123456
npm run release -- --github-repo glenzli/math-workspace
npm run release -- --gitlab-repo glenzli/math-workspace
```

真实发布会要求 Git worktree 干净。`--dry-run` 允许在 dirty worktree 下预览命令，但会提示真实发布会停止。

## 依赖策略

构建后的 Math Workspace、CLI 和 legacy 扩展应保持无 npm 运行时依赖。

开发依赖只用于：

- TypeScript 编译；
- Vite 打包；
- 测试；

规则：

- 尽量固定开发工具版本；
- 除非安全补丁需要，避免刚发布的大版本；
- audit 使用官方 npm registry；
- 不增加 postinstall hook 或运行时远程加载；
- 项目特有 release hook 不写进 `math-workspace`。
