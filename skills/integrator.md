# markdown-formal AI 能力融合指南

这个文件用于让目标项目的 AI 把 `markdown-formal` 融合进已有写作、改稿和迁移流程。它不是单纯的安装说明；源码位置、构建命令、软链接调试和依赖审查见 [development.md](development.md)。

## 融合原则

不要把 `markdown-formal` 当成一个孤立 skill 叠加在项目外层。目标项目通常已经有自己的写作 skill、`AGENTS.md`、`CLAUDE.md`、`GEMINI.md`、术语表、证明风格和章节模板。接入时应把本工具的规则合并到项目原生写作能力中，尤其是“数学编号 / 引用 / recall / 校验”部分。

融合后，AI 应保留目标项目原有文风和证明组织方式，同时遵守这些约束：

- 显示编号由工具生成，正文引用编号对象时只写稳定 hash ID。
- AI 新增编号 marker 时只写 `tmp-*`，不手动生成正式 hash。
- 小节只用于编号和跳转，不生成 hover recall。
- 命题、引理、定理、推论的 recall 只覆盖 `证明` / `Proof` 前的陈述。
- 定义不加 hash，只进入定义搜索。
- 注和例默认不加 hash；只有后文已经明确引用某个注/例时，才反向把那个注/例改成 `注 #tmp-*` 或 `例 #tmp-*`。
- 特殊 LaTeX 记号约定写入 `formal-symbols.json`，只维护 `source`、`pattern`、`meaning` 等源信息，由预览端做符号召回。
- 每次写完用工具统一生成 ID、刷新索引并检查引用。

## 融合步骤

1. 找到目标项目已有的 AI 写作入口，例如 `AGENTS.md`、`CLAUDE.md`、`GEMINI.md`、仓库 README、项目内 writing skill 或自定义 instruction。
2. 如果已有数学写作规则，把本文件和 [editor.md](editor.md) 的规则合并进去；不要创建一套互相竞争的平行规则。
3. 如果目标项目没有写作规则，创建一个轻量的项目级指令，并把“给 AI 的最小提示”放进去。
4. 接入 CLI 后运行 `npm run formal -- prepare`，让 AI 读取 `.markdown-formal/agent-guide.md` 和 `.markdown-formal/reference-map.md`。
5. 在目标项目里试写或迁移一个小范围，运行 `npm run formal -- finish <file-or-dir>` 和 `npm run formal -- verify`，再调整项目原生写作规则。

## 给 AI 的最小提示

把下面这段融入目标项目原有写作指令。不要简单附加在末尾后置执行；应合并到“数学编号、引用和校验”相关部分：

```text
写作或迁移前运行 npm run formal -- prepare。
优先读取 .markdown-formal/agent-guide.md，再读取目标原文和 .markdown-formal/reference-map.md。
引用已有对象时，只能从 reference-map.md 复制 @h-... 或 @h-....title。
重要引用附近保留自然语言语义，例如“由谱半径引理 `@h-...` 可得”；不要写成只有裸 `@h-...`。
新增小节、命题、引理、定理、推论等 marker 使用 tmp-1/tmp-2/...，不要手动生成 hash。
小节只用于编号和跳转；命题/引理/定理/推论的 recall 只覆盖 `证明` / `Proof` 前的陈述。
定义不加 hash，只写 `定义（术语）：...` 或 `Definition (Term): ...`。
注和例默认不加 hash；只有后文已经明确引用某个注/例时，才反向把那个注/例改成 `注 #tmp-*` 或 `例 #tmp-*`。
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
4. 把本仓库 `skills/` 复制到目标项目的 `skills/markdown-formal/`，或复制其中 `editor.md`、`integrator.md` 到目标项目既有 AI 指令目录。
5. 在目标项目 `package.json` 添加 `formal` script。
6. 把“给 AI 的最小提示”融合进目标项目的原生 AI 写作指令，而不是只作为附加安装记录。

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
- 本仓库开发、调试和构建细节放在 [development.md](development.md)。
- `.markdown-formal/` 主要是生成缓存，建议忽略；人工维护入口只有 `.markdown-formal/config.json`。
- 如果 `npm run formal -- prepare` 不存在或失败，先不要手写替代流程；让用户接入或修复工具入口。
