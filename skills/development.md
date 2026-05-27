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

基于软链接机制，当您或 AI Agent 通过 `npm run build` 更新了 TypeScript 编译产物后，只需要在编辑器中重新加载窗口（`Developer: Reload Window`），最新逻辑即可立刻生效。

需要注意：

- `src/webview/formal-script.ts` 会编译到 `media/formal-script.js`，改预览端交互后必须运行 `npm run build`。
- 扫描缓存位于 `.markdown-formal/`，包含 `preview-cache.json`、`config.json`、`agent-guide.md`、`reference-map.md` 和 `report.md`。
- 根目录 `formal-symbols.json` 是符号召回源表，修改后会刷新 `preview-cache.json`。
- CLI 源码位于 `src/cli/formal-tools.ts`；`npm run formal -- ...` 会先编译到 `out/cli/formal-tools.js` 再执行。
- `config.json` 支持 `"language": "zh"` 或 `"language": "en"`；旧配置缺少字段时会自动合并默认值。
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

当前 release 不引入 bundler、vsce 或压缩依赖，只组装可复制目录：

```bash
npm run release:local
```

产物位于 `dist/markdown-formal-<version>/`：

- `extension/`：编辑器扩展目录包。
- `cli/`：可复制到目标项目 `tools/markdown-formal/` 的 CLI 包。
- `manifest.json`：产物结构说明。
- `checksums.txt`：所有产物文件的 sha256。

`.vsix` 和单文件 CLI 暂不生成；需要时再单独审查相关打包依赖。

## 依赖安全

当前维护工具不引入任何新依赖，只使用 Node 内置模块。以后如果确实需要新增包，必须先审查 npm/GitHub/OSV/advisory、近期发布记录、维护者变更、install/postinstall 脚本和 tarball 内容，并固定精确版本，不使用最新版范围。

## 故障排查

如果在预览 Markdown 时发现插件未生效：
1. 确保所在工作区目录存在有效的 `*.md` 文件，并且触发了首次缓存扫描。
2. 确保没有权限问题导致无法写入工作区根目录的 `.markdown-formal/preview-cache.json`。
3. 确保包含 Markdown 文件的所在文件夹已经在编辑器中打开作为工作区，单独拖拽文件可能无法获取 `workspaceRoot`。
4. 可通过菜单栏 `Help > Toggle Developer Tools` 检查控制台（Console）中是否有 `[markdown-formal]` 相关的启动日志或报错。
