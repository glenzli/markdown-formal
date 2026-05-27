# markdown-formal AI 工作流接入指南

这个文件用于让 AI 把 `markdown-formal` 纳入自己的写作、改稿和迁移流程。它不是开发安装指南；源码位置、构建命令、软链接调试和依赖审查见 [dev-installer.md](dev-installer.md)。

## 接入目标

接入后，AI 应遵守这些规则：

- 显示编号由工具生成，正文引用编号对象时只写稳定 hash ID。
- AI 新增编号 marker 时只写 `tmp-*`，不手动生成正式 hash。
- 特殊 LaTeX 记号约定写入 `formal-symbols.json`，只维护 `source`、`pattern`、`meaning` 等源信息，由预览端做符号召回。
- 每次写完用工具统一生成 ID、刷新索引并检查引用。

## 给 AI 的最小提示

把下面这段加入项目级 AI 指令、仓库说明或对话开头即可：

```text
请遵守 skills/editor.md。
写作或迁移前运行 npm run formal -- prepare。
优先读取 .markdown-formal/agent-guide.md，再读取目标原文和 .markdown-formal/reference-map.md。
引用已有对象时，只能从 reference-map.md 复制 @h-... 或 @h-....title。
重要引用附近保留自然语言语义，例如“由谱半径引理 `@h-...` 可得”；不要写成只有裸 `@h-...`。
新增小节、命题、引理、定理、推论等 marker 使用 tmp-1/tmp-2/...，不要手动生成 hash。
只把项目明确约定的特殊记号写入 formal-symbols.json，不记录通用数学符号或整条推导公式。
写完运行 npm run formal -- finish <file-or-dir>。
保持 Markdown 和 LaTeX 原样。
```

## AI 使用流程

日常写作：

```bash
npm run formal -- prepare
npm run formal -- finish path/to/chapter.md
```

`prepare` 会生成 AI 当次需要读的文件：

- `.markdown-formal/agent-guide.md`：极简操作卡。
- `.markdown-formal/reference-map.md`：显示编号到 hash ID 的表。
- `.markdown-formal/preview-cache.json`：预览、导航、定义搜索和符号召回运行时缓存，通常不需要 AI 读取。
- `.markdown-formal/report.md`：lint/verify 详情。

AI 只需要优先读 `agent-guide.md` 和 `reference-map.md`；定义和符号查找交给预览搜索。不要直接编辑 `.markdown-formal/` 下的生成文件。

定义和符号查询默认只在当前 book 内生效。跨 book 查询必须在 `.markdown-formal/config.json` 显式声明依赖：

```json
{
  "lookup": {
    "bookDependencies": {
      "book3": ["book2"]
    }
  }
}
```

## Release 接入

如果使用本仓库生成的 release 产物，在目标项目中保持 repo-local 接入。推荐步骤：

1. 在本仓库运行 `npm run release:local`。
2. 核对 `dist/markdown-formal-<version>/checksums.txt`。
3. 把 `dist/markdown-formal-<version>/cli` 复制到目标项目的 `tools/markdown-formal/`。
4. 把本仓库 `skills/` 复制到目标项目的 `skills/markdown-formal/`，或复制其中 `editor.md`、`installer.md` 到目标项目既有 AI 指令目录。
5. 在目标项目 `package.json` 添加 `formal` script。
6. 把“给 AI 的最小提示”加入目标项目的 AI 项目指令、`AGENTS.md`、`CLAUDE.md`、`GEMINI.md` 或 README 中。

```text
your-project/
  tools/
    markdown-formal/   # 复制 dist/markdown-formal-<version>/cli
  skills/
    markdown-formal/   # 复制本仓库 skills/
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

不要从远端自动安装或自动更新 skill；不要让 AI 自动下载执行未知脚本。复制 release 产物前先核对 `checksums.txt`，升级时重复上述步骤。

## 目标项目初始文件

新项目通常只需要：

```text
.markdown-formal/
  config.json      # 可选；没有时工具会生成默认配置
formal-symbols.json # 可选；只有明确特殊记号时才创建
```

如果存在跨书查询依赖，在 `.markdown-formal/config.json` 中维护：

```json
{
  "language": "zh",
  "lookup": {
    "bookDependencies": {
      "book3": ["book2"]
    }
  }
}
```

## 迁移旧项目

逐步迁移单章或单卷，先 dry-run 再 apply：

```bash
npm run formal -- migrate-text-refs path/to/chapter-or-volume
npm run formal -- migrate-text-refs --apply path/to/chapter-or-volume
npm run formal -- migrate-ids path/to/chapter-or-volume
npm run formal -- migrate-ids --apply path/to/chapter-or-volume
```

逐章/逐卷迁移时，默认会同步处理 incoming refs：目标范围内按完整 reference map 迁移，目标范围外只处理指向目标范围编号 marker 的旧文字引用。只有明确要把改写限制在目标文件内时，才使用 `--target-only`。

如果 `migrate-ids --target-only` 发现目标范围内的旧 ID 被范围外文件引用，工具会拒绝 apply。此时去掉 `--target-only`，或选择更大的闭合范围：

```bash
npm run formal -- migrate-ids --apply path/to/chapter-or-volume
```

只有明确要一次性迁移全项目时才使用 `--all`。

`migrate-text-refs` 的报告不只包含 unresolved/ambiguous，也会列出旧 Markdown 链接和缺少 hash 的小节标题候选。AI 应读取 `.markdown-formal/text-ref-migration.md` 后手工处理这些项。

## 项目约定

- 写作细则和语法约束放在 [editor.md](editor.md)。
- 开发安装、调试和构建细节放在 [dev-installer.md](dev-installer.md)。
- `.markdown-formal/` 主要是生成缓存，建议忽略；人工维护入口只有 `.markdown-formal/config.json`。
- 如果 `npm run formal -- prepare` 不存在或失败，先不要手写替代流程；让用户安装或修复工具入口。
