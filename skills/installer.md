# markdown-formal AI 工作流接入指南

这个文件用于让 AI 把 `markdown-formal` 纳入自己的写作、改稿和迁移流程。它不是开发安装指南；源码位置、构建命令、软链接调试和依赖审查见 [dev-installer.md](dev-installer.md)。

## 接入目标

接入后，AI 应遵守三条规则：

- 显示编号由工具生成，正文引用编号对象时只写稳定 hash ID。
- AI 新增编号 marker 时只写 `tmp-*`，不手动生成正式 hash。
- 每次写完用工具统一生成 ID、刷新索引并检查引用。

## 给 AI 的最小提示

把下面这段加入项目级 AI 指令、仓库说明或对话开头即可：

```text
请遵守 skills/editor.md。
写作或迁移前运行 npm run formal -- prepare。
优先读取 .markdown-formal/agent-guide.md，再读取目标原文和 .markdown-formal/reference-map.md。
引用已有对象时，只能从 reference-map.md 复制 @h-... 或 @h-....title。
新增小节、命题、引理、定理、推论等 marker 使用 tmp-1/tmp-2/...，不要手动生成 hash。
写完运行 npm run formal -- finalize <file-or-dir>，再运行 npm run formal -- verify。
保持 Markdown 和 LaTeX 原样。
```

## AI 使用流程

日常写作：

```bash
npm run formal -- prepare
npm run formal -- finalize path/to/chapter.md
npm run formal -- verify
```

`prepare` 会生成 AI 当次需要读的文件：

- `.markdown-formal/agent-guide.md`：极简操作卡。
- `.markdown-formal/reference-map.md`：显示编号到 hash ID 的表。
- `.markdown-formal/preview-cache.json`：预览、导航和定义搜索运行时缓存，通常不需要 AI 读取。
- `.markdown-formal/report.md`：lint/verify 详情。

AI 只需要优先读 `agent-guide.md` 和 `reference-map.md`；定义查找交给预览搜索。不要直接编辑 `.markdown-formal/` 下的生成文件。

## Release 接入

如果使用本仓库生成的 release 产物，在目标项目中保持 repo-local 接入：

```text
your-project/
  tools/
    markdown-formal/   # 复制 dist/markdown-formal-<version>/cli
  skills/              # 复制 cli/skills 或 extension/skills
```

目标项目的 `package.json` 至少提供：

```json
{
  "scripts": {
    "formal": "node tools/markdown-formal/out/cli/formal-tools.js"
  }
}
```

接入后先运行：

```bash
npm run formal -- prepare
npm run formal -- verify
```

不要从远端自动安装或自动更新 skill；复制 release 产物前先核对 `checksums.txt`。

## 迁移旧项目

逐步迁移单章或单卷，先 dry-run 再 apply：

```bash
npm run formal -- migrate-text-refs --dry-run path/to/chapter-or-volume
npm run formal -- migrate-text-refs --apply path/to/chapter-or-volume
npm run formal -- migrate-text-refs --dry-run --update-refs-all path/to/chapter-or-volume
npm run formal -- migrate-text-refs --apply --update-refs-all path/to/chapter-or-volume
npm run formal -- migrate-ids --dry-run path/to/chapter-or-volume
npm run formal -- migrate-ids --apply path/to/chapter-or-volume
```

`migrate-text-refs --update-refs-all` 用于逐章/逐卷迁移时同步处理 incoming refs：目标范围内按完整 reference map 迁移，目标范围外只处理指向目标范围编号 marker 的旧文字引用。

如果 `migrate-ids` 发现目标范围内的旧 ID 被范围外文件引用，工具会拒绝 scoped apply。此时选择更大的闭合范围，或只迁移目标编号 marker 并同步更新入站引用：

```bash
npm run formal -- migrate-ids --apply --update-refs-all path/to/chapter-or-volume
```

只有明确要一次性迁移全项目时才使用 `--all`。

`migrate-text-refs` 的报告不只包含 unresolved/ambiguous，也会列出旧 Markdown 链接和缺少 hash 的小节标题候选。AI 应读取 `.markdown-formal/text-ref-migration.md` 后手工处理这些项。

## 项目约定

- 写作细则和语法约束放在 [editor.md](editor.md)。
- 开发安装、调试和构建细节放在 [dev-installer.md](dev-installer.md)。
- `.markdown-formal/` 主要是生成缓存，建议忽略；人工维护入口只有 `.markdown-formal/config.json`。
- 如果 `npm run formal -- prepare` 不存在或失败，先不要手写替代流程；让用户安装或修复工具入口。
