# markdown-formal 项目开发指南

这个文件用于维护本仓库自身的开发、调试、校验、release 和依赖安全流程。AI 写作和旧项目迁移流程不放在本文档，见 [AI 能力融合指南](integrator.md) 和 [AI 写作规范](editor.md)。

## 本地扩展调试

1. 打开终端（Terminal）。
2. 执行以下命令，将当前 `markdown-formal` 绝对路径软链接到您的扩展目录下：

   **对于 VS Code:**
   ```bash
   ln -s "$PWD" ~/.vscode/extensions/markdown-formal
   ```

   **对于 Antigravity IDE:**
   ```bash
   ln -s "$PWD" ~/.antigravity-ide/extensions/markdown-formal
   ```

3. 重新加载编辑器，在命令面板中执行：**`Developer: Reload Window`**。

## 热更新

基于软链接机制，当您或 AI Agent 通过 `npm run build` 更新了构建产物后，只需要在编辑器中重新加载窗口（`Developer: Reload Window`），最新逻辑即可立刻生效。

需要注意：

- `src/webview/formal-script.ts` 会打包到 `media/formal-script.js`，改预览端交互后必须运行 `npm run build`。
- Webview 端由固定版本 `vite@6.4.3` 打包成单文件 IIFE；不要新增 Vite dev server 脚本，预览运行时只加载 `media/formal-script.js` 和 `media/styles.css`。
- 扫描缓存位于 `.markdown-formal/`，包含 `preview-cache.json`、`config.json`、`agent-guide.md`、`reference-map.md`、`dependency-graph.json`、`dependency-report.md` 和 `report.md`。
- 项目根的 `.markdown-formal/definitions.json` 和 `.markdown-formal/symbols.json` 分别是非标准定义查询、符号表源表，修改后会刷新 `preview-cache.json`。
- CLI 源码位于 `src/cli/`；`npm run formal -- ...` 会先 typecheck 并用 Vite 打包到 `out/cli/formal-tools.js` 再执行。
- `config.json` 支持 `"language": "zh"` 或 `"language": "en"`；`scan.exclude` 排除扫描目录，`preview.ignoreHover` 按完整相对路径、裸文件名或 glob 关闭正文 `@hash` recall hover，`pdf` 配置 PDF 渲染默认版式、目录标题和可选封面元数据，`debug.previewLog` 临时写入 `.markdown-formal/preview-debug.log` 用于排查空白预览，`debug.markerTraceIds` 可临时追踪单个 hash 的替换前后 token；旧配置缺少字段时会自动合并默认值。
- 修改示例书结构后，重新打开预览或重新加载窗口可以触发扫描。

## 开发校验

修改源码后至少运行：

```bash
npm test
```

如果改了 CLI 或扫描逻辑，再运行：

```bash
npm run formal -- prepare
npm run formal -- help
npm run formal -- perf-dummy 50 200
```

## 本地 Release

release 同时生成 VSIX、可复制扩展目录、可 vendoring 的 CLI 包、AI skills 和文档。CLI 和 webview 脚本在 `npm run build` 阶段已经由 Vite 输出到 `out/cli/*.js` 和 `media/formal-script.js`；VSIX 由固定版本 `@vscode/vsce@3.9.2` 从本地 dev dependency 生成：

```bash
npm run release:local
```

产物位于 `dist/markdown-formal-<version>/`：

- `markdown-formal-<version>.vsix`：VS Code 兼容扩展安装包。
- `extension/`：编辑器扩展目录包。
- `cli/`：可复制到目标项目 `tools/markdown-formal/` 的 CLI 包。
- `skills/`：给目标项目 AI 指令融合用的规则源材料。
- `docs/`：人类阅读的使用、AI 集成和 release 文档。
- `INSTALL.md`：当前 release 包的快速安装说明。
- `manifest.json`：产物结构说明。
- `checksums.txt`：所有产物文件的 sha256。

VSIX 用于正式编辑器安装；本地开发仍优先使用软链接。CLI release 直接复制已经打包好的 `out/cli/formal-tools.js` 和 `out/cli/release.js`，运行时不依赖 npm 包。

## 依赖安全

运行时维护工具仍只使用 Node 内置模块；新增依赖只允许作为开发期构建、测试或打包依赖。当前额外开发依赖为固定版本 `vite@6.4.3` 和 `@vscode/vsce@3.9.2`，分别用于 `vite build` 生成 CLI/webview 单文件脚本，以及生成 VSIX。

新增或升级 npm 包前必须：

1. 审查官方 GitHub Security Advisories、npm 元数据、近期 release 记录和维护者变更。
2. 避开刚发布的最新大版本，除非安全补丁只能通过最新大版本获得。
3. 使用 `--save-exact` 固定精确版本，并提交 `package-lock.json`。
4. 检查依赖树、install/postinstall 脚本和 tarball 内容；不要引入运行时远程加载。
5. 运行 `npm audit --registry=https://registry.npmjs.org --omit=optional`，默认镜像不支持 audit 时不要把失败误判为安全通过。

## 故障排查

如果在预览 Markdown 时发现插件未生效：
1. 确保所在工作区根目录存在 `.markdown-formal/config.json`；没有这个文件时增强预览会保持关闭。
2. 运行 `npm run formal -- prepare` 或命令面板 `Markdown Formal: Refresh References`，生成 `.markdown-formal/preview-cache.json`。
3. 确保包含 Markdown 文件的所在文件夹已经在编辑器中打开作为工作区，单独拖拽文件可能无法获取 `workspaceRoot`。
4. 确保没有权限问题导致无法写入工作区根目录的 `.markdown-formal/preview-cache.json`。
5. 可通过菜单栏 `Help > Toggle Developer Tools` 检查控制台（Console）中是否有 `[markdown-formal]` 相关的启动日志或报错。
