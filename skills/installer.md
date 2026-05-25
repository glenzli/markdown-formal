# markdown-formal 工作流与安装指南

`markdown-formal` 用于编写可引用、可预览、可长期重排的数学 Markdown。它把“人类可读编号”和“机器稳定 ID”分开：文件结构决定章、卷、附录编号，`#id` 决定跨文档引用。

## 推荐工作流

1. 用 `skills/editor.md` 作为 AI 写作规约。
2. 按书、卷、章节组织文件，例如 `book2/vol-1-foundations/01-background.md`。
3. 使用 `:::theorem {#id title="..."}` 这类容器块定义可引用对象。
4. 使用 `@id` 和 `@id.title` 引用对象，避免手写显示编号。
5. 打开 Markdown Preview，扩展会扫描工作区并生成 `.markdown-formal/labels.json`、`.markdown-formal/pages.json` 和 `.markdown-formal/config.json`。

## AI Agent 使用建议

给 AI 编写或重构内容时，建议明确附带：

```text
请遵守 skills/editor.md：
- ID 稳定、全局唯一，不用显示编号作为 ID。
- 章节由 NN-title.md 推断，卷目录不重置正文章号。
- intro.md 和 summary.md 可导航但不编号。
- appendix-a-title.md 使用附录编号，附录编号按卷生效。
- 引用使用 @id / @id.title，不手写定理编号。
- LaTeX 和 Markdown 内容保持原样，方便 hover 预览渲染。
```

为了让 AI 更稳，项目最好持续维护三个东西：

- `examples/`：覆盖真实写法，包括单书、多卷、intro/summary、卷内附录。
- `skills/editor.md`：作为写作约束，随着语法演进同步更新。
- 一个轻量 lint 脚本：检查重复 ID、缺失引用、错误文件名、意外跨书引用。

## 多语言配置

只支持中文和英文。配置文件位于 `.markdown-formal/config.json`：

```json
{
  "language": "zh"
}
```

可选值：

- `"zh"`：中文类型名与导航文案。
- `"en"`：英文类型名与导航文案。

如果需要覆盖类型名或导航文案，可以在 `dictionary` 或 `ui` 中只写要覆盖的键；扩展会自动合并默认值。

## 插件安装

正式使用时安装 `.vsix`，或在插件市场搜索 `markdown-formal`。安装后，在工作区中打开任意 Markdown 文件即可触发扩展。

开发和本地调试请看 [开发者版安装指南](dev-installer.md)。
