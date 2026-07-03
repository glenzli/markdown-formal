# Release

[🌍 English](#en) | [🇨🇳 中文](#zh-cn)

---

<a name="en"></a>

## 🌍 English

`markdown-formal` releases include four surfaces:

- an editor extension package;
- a vendorable CLI runtime;
- reviewed AI workflow artifacts that should be merged into target projects;
- VASMC catalog exports for lockable reuse.

### Build

Install dependencies:

```bash
npm install
```

Run tests:

```bash
npm test
```

Build the release bundle:

```bash
npm run release:local
```

The release bundle is written directly to `dist/`; that directory represents the current build:

```text
dist/
```

The `dist/` directory represents the current build output and does not add another versioned wrapper directory. The version remains in the VSIX filename, `manifest.json`, and npm package metadata. The source checkout / npm catalog lives at `vasm-catalog/`; the release catalog lives at `dist/vasm-catalog/`.

### Release Layout

```text
dist/
  markdown-formal-<version>.vsix
  extension/
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

Artifact roles:

- `markdown-formal-<version>.vsix`: VS Code-compatible extension package.
- `extension/`: unpacked extension directory for local editor extension folders.
- `cli/`: dependency-free CLI runtime for target projects.
- `skills/`: AI rule and composition guidance artifacts, currently `skills/editor.md` and `skills/integrator.md`.
- `vasm-catalog/`: catalog for VASMC consumers, including `vasmc-catalog.yaml`, the `editor` export, and the `integrator` export.
- `docs/`: human-facing documentation.
- `manifest.json`: machine-readable artifact map.
- `checksums.txt`: SHA-256 checksums.

`docs-src/`, `skills-src/`, `.vasmc/`, `vasmc-build-state.yaml`, and other
repository-internal content sources or build state files are not release artifacts. External VASMC reuse must go through the artifacts and hashes in `vasm-catalog/`, not by scanning these source directories.

### npm Package

The npm package installs the CLI, AI artifacts, and VASMC catalog. It does not replace the VSIX:

```bash
npm install -D markdown-formal
```

Target project script:

```json
{
  "scripts": {
    "formal": "markdown-formal"
  }
}
```

npm package entries:

- `bin.markdown-formal`: points to `out/cli/formal-tools.js`.
- `skills/`: `editor.md` and `integrator.md` for plain AI review and integration.
- `vasm-catalog/`: catalog exports for VASMC consumers.
- `docs/`: human-facing usage and release documentation.

Both the VSIX and npm package are scoped by `package.json.files`; do not add `.vscodeignore` at the same time because VSCE does not support combining both packaging strategies.

Use the npm package catalog:

```bash
vasmc add --catalog node_modules/markdown-formal/vasm-catalog/vasmc-catalog.yaml --export editor --alias markdown-formal-editor
vasmc add --catalog node_modules/markdown-formal/vasm-catalog/vasmc-catalog.yaml --export integrator --alias markdown-formal-integrator
```

### Install Extension

Install the packaged extension:

```bash
code --install-extension dist/markdown-formal-<version>.vsix
```

For development, prefer a symlink:

```bash
ln -s "$PWD" ~/.vscode/extensions/markdown-formal
```

For Antigravity:

```bash
ln -s "$PWD" ~/.antigravity-ide/extensions/markdown-formal
```

Rebuild after changes:

```bash
npm run build
```

Then reload the editor window.

### Vendor CLI

Copy the CLI into a target project:

```bash
mkdir -p path/to/project/tools/markdown-formal
cp -R dist/cli/* path/to/project/tools/markdown-formal/
```

Add the script in the target project:

```json
{
  "scripts": {
    "formal": "node tools/markdown-formal/out/cli/formal-tools.js"
  }
}
```

Initialize:

```bash
npm run formal -- prepare
```

Verify:

```bash
npm run formal -- verify
```

### AI Skill Distribution

The `skills/` directory contains reviewable AI artifacts, not a remote installer. If the target project uses VASMC, prefer the release catalog.

Target projects should:

1. review `skills/editor.md`;
2. review `skills/integrator.md`;
3. merge the rules into project-native AI instructions;
4. preserve project-specific writing style and release rules.

If the target project also uses VASMC, lock the catalog exports:

```bash
vasmc add --catalog path/to/vasm-catalog/vasmc-catalog.yaml --export editor --alias markdown-formal-editor
vasmc add --catalog path/to/vasm-catalog/vasmc-catalog.yaml --export integrator --alias markdown-formal-integrator
```

The consumer `vasmc-lock.yaml` fixes artifact hashes; the integrative export's `appliesTo` is also resolved to the editor artifact hash. The target project does not need to scan a remote repository or trust an unlocked path.

### Release Checks

If public docs or skills changed, generate VASMC outputs first:

```bash
npm run content:build -- --dry-run
npm run content:build
```

`--plan` is an alias for `--dry-run`; both only inspect the plan and do not write generated outputs, build-state, or the default report.
Before release, run `npm run content:build`, read `.vasmc/build-report.yaml`, complete pending translate or review actions, and then continue release checks.

Run npm audit against the official registry:

```bash
npm audit --registry=https://registry.npmjs.org --omit=optional
```

Run the full test gate:

```bash
npm test
```

Build the release:

```bash
npm run release:local
```

Review:

- `dist/manifest.json`
- `dist/checksums.txt`
- the VSIX contents if extension packaging changed

### Release Orchestration

`release:local` only builds local artifacts. Use the publish orchestration script for platform releases:

```bash
npm run release -- --dry-run
npm run release -- --only github,npm
npm run release -- --skip gitlab
```

Shortcut commands:

```bash
npm run release:github
npm run release:gitlab
npm run release:npm
```

Pre-publish gate:

```bash
npm run release:check
```

`release:check` validates the release script syntax, runs `release:local`, runs npm pack dry-run, and runs `git diff --check`.

Default release targets:

- `npm`: publish the `markdown-formal` npm package with CLI, public docs, `skills/`, and `vasm-catalog/`.
- `github`: push the current branch and release tag to the `github` remote, then create a GitHub release with `gh`.
- `gitlab`: push the current branch and release tag to the `gitlab` remote, then create a GitLab release with `glab`.

GitHub/GitLab releases attach:

- `dist/markdown-formal-<version>.vsix`
- `dist/manifest.json`
- `dist/checksums.txt`
- `dist/INSTALL.md`

Common arguments:

```bash
npm run release -- --tag v0.1.0
npm run release -- --npm-tag latest
npm run release -- --otp 123456
npm run release -- --github-repo glenzli/markdown-formal
npm run release -- --gitlab-repo glenzli/markdown-formal
```

Real publishing requires a clean Git worktree. `--dry-run` can preview commands from a dirty worktree, but it warns that a real release would stop.

### Dependency Policy

The built extension and CLI should remain runtime dependency-free.

Development dependencies are allowed for:

- TypeScript compilation;
- Vite bundling;
- tests;
- VSIX packaging.

Rules:

- pin development tools where practical;
- avoid fresh major versions unless needed for a security fix;
- run audit against the official npm registry;
- do not add postinstall hooks or runtime remote loaders;
- keep project-specific release hooks outside `markdown-formal`.

---

<a name="zh-cn"></a>

## 🇨🇳 中文

`markdown-formal` 的 release 包含四类产物：

- 编辑器扩展包；
- 可 vendoring 的 CLI 运行时；
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

`dist/` 只表示当前构建结果，不再额外包一层版本目录。版本号保留在 VSIX 文件名、`manifest.json` 和 npm package metadata 中。`vasm-catalog/` 的源码 checkout / npm 发布面位于仓库根目录；release 发布面位于 `dist/vasm-catalog/`。

## Release 结构

```text
dist/
  markdown-formal-<version>.vsix
  extension/
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

各产物职责：

- `markdown-formal-<version>.vsix`：VS Code 兼容扩展安装包。
- `extension/`：用于本地编辑器扩展目录的解包版本。
- `cli/`：目标项目使用的无运行时依赖 CLI。
- `skills/`：AI 规则与组合指导 artifact，目前包含 `skills/editor.md` 和 `skills/integrator.md`。
- `vasm-catalog/`：面向 VASMC consumer 的 catalog，包含 `vasmc-catalog.yaml`、`editor` export 和 `integrator` export。
- `docs/`：面向人的文档。
- `manifest.json`：机器可读产物表。
- `checksums.txt`：SHA-256 校验和。

`docs-src/`、`skills-src/`、`.vasmc/`、`vasmc-build-state.yaml` 等仓库内部
内容源和构建状态不是 release 产物。对外 VASMC 复用必须通过 `vasm-catalog/` 中的 artifact 和 hash，而不是直接扫描这些 source 目录。

## npm 包

npm 包用于安装 CLI、AI artifacts 和 VASMC catalog，不替代 VSIX：

```bash
npm install -D markdown-formal
```

目标项目脚本：

```json
{
  "scripts": {
    "formal": "markdown-formal"
  }
}
```

npm 包入口：

- `bin.markdown-formal`：指向 `out/cli/formal-tools.js`。
- `skills/`：裸 AI 审阅和融合用的 `editor.md` / `integrator.md`。
- `vasm-catalog/`：VASMC consumer 使用的 catalog exports。
- `docs/`：面向人的 usage 和 release 文档。

VSIX 和 npm 包都由 `package.json.files` 控制包含范围；不要再同时引入 `.vscodeignore`，VSCE 不支持两套策略并存。

使用 npm 包里的 catalog：

```bash
vasmc add --catalog node_modules/markdown-formal/vasm-catalog/vasmc-catalog.yaml --export editor --alias markdown-formal-editor
vasmc add --catalog node_modules/markdown-formal/vasm-catalog/vasmc-catalog.yaml --export integrator --alias markdown-formal-integrator
```

## 安装扩展

安装打包扩展：

```bash
code --install-extension dist/markdown-formal-<version>.vsix
```

本地开发优先使用软链接：

```bash
ln -s "$PWD" ~/.vscode/extensions/markdown-formal
```

Antigravity：

```bash
ln -s "$PWD" ~/.antigravity-ide/extensions/markdown-formal
```

修改后重新构建：

```bash
npm run build
```

然后 reload editor window。

## Vendoring CLI

把 CLI 复制到目标项目：

```bash
mkdir -p path/to/project/tools/markdown-formal
cp -R dist/cli/* path/to/project/tools/markdown-formal/
```

目标项目添加脚本：

```json
{
  "scripts": {
    "formal": "node tools/markdown-formal/out/cli/formal-tools.js"
  }
}
```

初始化：

```bash
npm run formal -- prepare
```

校验：

```bash
npm run formal -- verify
```

## AI Skill 分发

`skills/` 是可审阅的 AI artifact，不是远程安装器。通过 VASMC 使用时，优先使用 release catalog。

目标项目应该：

1. 审阅 `skills/editor.md`；
2. 审阅 `skills/integrator.md`；
3. 把规则融合进项目原生 AI 指令；
4. 保留目标项目自己的文风和 release 规则。

如果目标项目本身也使用 VASMC，推荐锁定 catalog exports：

```bash
vasmc add --catalog path/to/vasm-catalog/vasmc-catalog.yaml --export editor --alias markdown-formal-editor
vasmc add --catalog path/to/vasm-catalog/vasmc-catalog.yaml --export integrator --alias markdown-formal-integrator
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
- 如果扩展打包逻辑有变化，检查 VSIX 内容

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

- `npm`：发布 `markdown-formal` npm 包，包内包含 CLI、public docs、`skills/` 与 `vasm-catalog/`。
- `github`：推送当前 branch 和 release tag 到 `github` remote，并用 `gh` 创建 GitHub release。
- `gitlab`：推送当前 branch 和 release tag 到 `gitlab` remote，并用 `glab` 创建 GitLab release。

GitHub/GitLab release 会附带：

- `dist/markdown-formal-<version>.vsix`
- `dist/manifest.json`
- `dist/checksums.txt`
- `dist/INSTALL.md`

常用参数：

```bash
npm run release -- --tag v0.1.0
npm run release -- --npm-tag latest
npm run release -- --otp 123456
npm run release -- --github-repo glenzli/markdown-formal
npm run release -- --gitlab-repo glenzli/markdown-formal
```

真实发布会要求 Git worktree 干净。`--dry-run` 允许在 dirty worktree 下预览命令，但会提示真实发布会停止。

## 依赖策略

构建后的扩展和 CLI 应保持无 npm 运行时依赖。

开发依赖只用于：

- TypeScript 编译；
- Vite 打包；
- 测试；
- VSIX 打包。

规则：

- 尽量固定开发工具版本；
- 除非安全补丁需要，避免刚发布的大版本；
- audit 使用官方 npm registry；
- 不增加 postinstall hook 或运行时远程加载；
- 项目特有 release hook 不写进 `markdown-formal`。
