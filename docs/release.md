# Release

[🌍 English](#en) | [🇨🇳 中文](#zh-cn)

---

<a name="en"></a>

## 🌍 English

`markdown-formal` releases include three surfaces:

- an editor extension package;
- a vendorable CLI runtime;
- AI workflow documents that should be merged into target projects.

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

The release bundle is written to:

```text
dist/markdown-formal-<version>/
```

### Release Layout

```text
dist/markdown-formal-<version>/
  markdown-formal-<version>.vsix
  extension/
  cli/
  skills/
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
- `skills/`: AI integration source material.
- `docs/`: human-facing documentation.
- `manifest.json`: machine-readable artifact map.
- `checksums.txt`: SHA-256 checksums.

`docs-src/`, `skills-src/`, `.vasmc/`, `vasmc-build-state.yaml`, and other
repository-internal content sources or build state files are not release artifacts.

### Install Extension

Install the packaged extension:

```bash
code --install-extension dist/markdown-formal-<version>/markdown-formal-<version>.vsix
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
cp -R dist/markdown-formal-<version>/cli/* path/to/project/tools/markdown-formal/
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

The `skills/` directory is documentation, not a remote installer.

Target projects should:

1. review `skills/editor.md`;
2. review `skills/integrator.md`;
3. merge the rules into project-native AI instructions;
4. preserve project-specific writing style and release rules.

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

- `dist/markdown-formal-<version>/manifest.json`
- `dist/markdown-formal-<version>/checksums.txt`
- the VSIX contents if extension packaging changed

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

`markdown-formal` 的 release 包含三类产物：

- 编辑器扩展包；
- 可 vendoring 的 CLI 运行时；
- 需要融合到目标项目的 AI 工作流文档。

### 构建

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

release 包输出到：

```text
dist/markdown-formal-<version>/
```

### Release 结构

```text
dist/markdown-formal-<version>/
  markdown-formal-<version>.vsix
  extension/
  cli/
  skills/
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
- `skills/`：AI 集成规则源材料。
- `docs/`：面向人的文档。
- `manifest.json`：机器可读产物表。
- `checksums.txt`：SHA-256 校验和。

`docs-src/`、`skills-src/`、`.vasmc/`、`vasmc-build-state.yaml` 等仓库内部
内容源和构建状态不是 release 产物。

### 安装扩展

安装打包扩展：

```bash
code --install-extension dist/markdown-formal-<version>/markdown-formal-<version>.vsix
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

### Vendoring CLI

把 CLI 复制到目标项目：

```bash
mkdir -p path/to/project/tools/markdown-formal
cp -R dist/markdown-formal-<version>/cli/* path/to/project/tools/markdown-formal/
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

### AI Skill 分发

`skills/` 是文档，不是远程安装器。

目标项目应该：

1. 审阅 `skills/editor.md`；
2. 审阅 `skills/integrator.md`；
3. 把规则融合进项目原生 AI 指令；
4. 保留目标项目自己的文风和 release 规则。

### Release 检查

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

- `dist/markdown-formal-<version>/manifest.json`
- `dist/markdown-formal-<version>/checksums.txt`
- 如果扩展打包逻辑有变化，检查 VSIX 内容

### 依赖策略

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
