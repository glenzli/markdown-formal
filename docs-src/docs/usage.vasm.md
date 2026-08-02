---
vasm:
  alias: markdown-formal-usage
  intent: "Document markdown-formal syntax, command workflow, configuration, graph, migration, and PDF export usage."
  compile:
    format: informational
    targetLangs: ["en", "zh-CN"]
---

# Usage

这份文档说明 `markdown-formal` 的源码语法和常用命令流程。

最简流程：

1. 在原本需要人工维护编号的位置写稳定 marker。
2. 在正文中使用 `@h-...` 引用。
3. 由 CLI 生成 hash ID、预览缓存和报告。

## 核心模型

[核心模型](../fragments/formal-core-model.vasm.md "@import:inline")

## 核心语法

写作时先使用临时 ID：

```markdown
# #tmp-1 测度论基础

## #tmp-2 弱收敛

定义（紧族）：一族概率测度称为紧族，如果 ...

定理 #tmp-3（Prokhorov 判据）：设 \(\mathcal{P}\) 为一族概率测度。

证明：...

该结论由 @tmp-3 得到。
```

运行 `finish` 后，临时 ID 会被替换成稳定 hash：

```markdown
定理 #h-3f7a1c9d5b0e72aa（Prokhorov 判据）：...
```

声明语法和引用语法必须区分：

```text
#h-...       正式声明
#tmp-*       临时声明
@h-...       正文引用
@h-....title 只渲染标题
@h-....full  渲染标签和标题
```

不要在正文里写声明语法。应写 `由 @h-... 可得`，不要写 `由定理 #h-... 可得`。

## 编号对象

支持的声明形式：

```markdown
## #tmp-1 小节标题

命题 #tmp-2（局部估计）：...

引理 #tmp-3（紧性引理）：...

定理 #tmp-4（主定理）：...

推论 #tmp-5（唯一性）：...

公式 #tmp-6：
$$
\|Tx\| \le C\|x\|
$$

图 #tmp-7（交换图）：...

表 #tmp-8（参数范围）：
```

英文 marker 也支持：

```markdown
Proposition #tmp-1 (Local Estimate): ...
Lemma #tmp-2 (Compactness Lemma): ...
Theorem #tmp-3 (Main Theorem): ...
Corollary #tmp-4 (Uniqueness): ...
Equation #tmp-5:
Figure #tmp-6 (Commutative diagram): ...
Table #tmp-7 (Parameter ranges):
```

小节只作为编号和跳转锚点，不生成 recall 预览。

命题类对象会生成 recall 预览。预览只收录陈述部分，并在 `证明` / `Proof` 前停止。

## 定义

定义是查询对象，不是编号对象。

标准定义会被自动扫描：

```markdown
定义（有界算子）：若线性映射 \(T:X\to Y\) 满足 ...

Definition (Bounded operator): A linear map \(T:X\to Y\) is bounded if ...
```

只有例外情况才写入 `.markdown-formal/definitions.json`：

- 非标准行文定义；
- 别名；
- 中英互查；
- 需要稳定多段预览内容；
- 自动范围可能不可靠的定义。

示例：

```json
[
  {
    "term": "有界算子",
    "aliases": ["bounded operator"],
    "source": "book/01-foundations.md:42",
    "content": "有界算子是满足 \\(\\|Tx\\|\\le C\\|x\\|\\) 的线性映射 \\(T:X\\to Y\\)。"
  }
]
```

## 符号表

项目特有记号写入 `.markdown-formal/symbols.json`。

```json
[
  {
    "pattern": "\\operatorname{Spec}(${operator})",
    "meaning": "匹配到的算子的谱。",
    "scope": "book",
    "source": "book/02-operators.md:18"
  }
]
```

不要索引普通变量、通用记号或完整推导公式。

## 常规流程

生成上下文：

```bash
npm run formal -- prepare
```

编辑文件或目录后，固化临时 ID 并刷新报告：

```bash
npm run formal -- finish path/to/chapter-or-dir
```

运行严格校验：

```bash
npm run formal -- verify
```

## 本地 Reader

Reader 是 `markdown-formal` 的主阅读界面。它在内存中扫描已经存在 formal 配置的项目，不写入源码或 `.markdown-formal/` 产物：

```bash
npm run formal -- serve /path/to/project
```

也可以不传项目路径，打开本机项目启动台：

```bash
npm run formal -- serve
```

启动台可以从系统目录选择器选择项目，或重开最近项目。选择的目录必须已有 `.markdown-formal/config.json`；最近记录只保存在本机用户状态目录，不写入项目源码或 `.markdown-formal/`。网页只提交最近项目的索引，目录路径始终由本地 Reader 服务处理。

命令会打印一个仅绑定 `127.0.0.1` 的本地 URL。可在 Codex 的本地浏览器侧栏或普通浏览器中打开。Reader 提供：

- 多书/多卷/章节导航；
- 当前页目录；
- 仅在需要时加载的命题类 recall；
- 全书定义查找与当前页符号表；
- 依赖摘要；
- 源文件改动后的实时刷新。

项目需要先有 `.markdown-formal/config.json`；首次使用可运行 `prepare`。Reader 不要求预先生成 `preview-cache.json`。

VS Code 包仍可作为 legacy compatibility integration 使用，但新功能以 Reader 为优先目标。

## AI 工作流接入

AI 规则不再放在单独的 public doc 中。目标项目应直接读取随包发布的 AI artifacts：

```text
skills/editor.md      # 具体写作和迁移规则
skills/integrator.md  # 如何融合进目标项目原生 AI 指令
```

如果通过 npm 安装，对应路径是：

```text
node_modules/markdown-formal/skills/editor.md
node_modules/markdown-formal/skills/integrator.md
```

如果目标项目使用 VASMC，使用 catalog 锁定这两个 artifact：

```bash
vasmc add --catalog node_modules/markdown-formal/vasm-catalog/vasmc-catalog.yaml --export editor --alias markdown-formal-editor
vasmc add --catalog node_modules/markdown-formal/vasm-catalog/vasmc-catalog.yaml --export integrator --alias markdown-formal-integrator
```

对于 release bundle，把上面的 catalog 路径替换为：

```text
dist/vasm-catalog/vasmc-catalog.yaml
```

CLI 可打印当前安装中的关键路径：

```bash
npm run formal -- paths
```

不要自动拉取远端 skill，也不要把 integrator 原样追加到目标 prompt 末尾。应先审阅 artifact，再把规则融合到目标项目已有的 `AGENTS.md`、写作 skill、风格指南或 release 指令中。

## 迁移流程

试运行文字编号引用迁移：

```bash
npm run formal -- migrate-text-refs path/to/chapter-or-volume
```

应用文字编号引用迁移：

```bash
npm run formal -- migrate-text-refs --apply path/to/chapter-or-volume
```

试运行旧 ID 迁移：

```bash
npm run formal -- migrate-ids path/to/chapter-or-volume
```

应用旧 ID 迁移：

```bash
npm run formal -- migrate-ids --apply path/to/chapter-or-volume
```

## 依赖图

生成依赖图摘要：

```bash
npm run formal -- graph summary
```

查看某个命题类对象的局部图：

```bash
npm run formal -- graph focus <h-id> --depth 2
```

查看下游影响范围：

```bash
npm run formal -- graph impact <h-id>
```

查看上游依赖：

```bash
npm run formal -- graph upstream <h-id>
```

汇总章节层面的依赖流：

```bash
npm run formal -- graph matrix chapter
```

依赖图只记录显式 `@h-...` 引用。AI 或领域工具推测出的数学依赖应由目标项目单独维护，不要混入 canonical graph。

## 项目结构

扫描器从路径推断书、卷、章节、导论、总结和附录。

```text
book/
  00-introduction.md
  01-foundations.md
  02-main-results.md
  summary.md
  appendix-a-background.md

multi-volume-book/
  vol-01-foundations/
    intro.md
    01-basic-objects.md
    02-compactness.md
    summary.md
    appendix-a-notation.md
  vol-02-applications/
    03-stability.md
    04-examples.md
```

卷目录只增加导航层，不重置正文章号。

附录采用附录局部编号，例如 `A.1`、`A.2`。

## 配置

常见 `.markdown-formal/config.json`：

```json
{
  "language": "zh",
  "scan": {
    "exclude": [
      ".build/**",
      ".context/**",
      "draft/**",
      "notes/private/**"
    ]
  },
  "lookup": {
    "bookDependencies": {
      "advanced-book": ["foundations-book"]
    }
  },
  "preview": {
    "ignoreHover": [
      "appendix-*-concepts.md",
      "book/**/glossary.md"
    ]
  },
  "render": {
    "pageHeadingStyle": "label-title"
  }
}
```

跨 book 引用和查询必须在 `lookup.bookDependencies` 中显式声明。

## PDF 导出

先把 formal 源导出为普通 Markdown，再交给其他发布流程处理：

```bash
npm run formal -- export-md path/to/book --out dist/book.md
```

导出时保留源目录结构：

```bash
npm run formal -- export-md-split path/to/book --out dist/public
```

使用本机 Pandoc/LaTeX 引擎从 formal 源直接导出 PDF：

```bash
npm run formal -- export-pdf path/to/book --out dist/book.pdf
```

渲染已经处理好的普通 Markdown：

```bash
npm run formal -- render-pdf dist/book.md --out dist/book.pdf
```

`render-pdf` 不扫描 formal 源，不重写 `#h-*`，也不解析 `@h-*`。
它只用共享的 Pandoc 版式参数渲染已经编译好的 Markdown。目标项目
需要自己的 release 后处理时，应使用：

```text
export-md -> project postprocess -> render-pdf
```

默认 PDF 行为：

- 纸张：`a4`；
- 页边距：`2.5cm`；
- 目录：默认开启；
- 目录深度：`2`；
- 目录标题：根据 `language` 选择，例如 `Contents` 或 `目录`；
- 目录独立分页：默认开启；
- PDF 引擎：`xelatex`；
- 封面页：可选，默认 `simple` 风格；
- 出版元数据页：可选，位于封面页之后、目录之前；
- front matter 声明页：可选，位于 metadata 之后、目录之前。

PDF 选项放在 `.markdown-formal/config.json` 的 `pdf` 字段中：

```json
{
  "language": "zh-CN",
  "pdf": {
    "title": "书名",
    "subtitle": "卷 I：基础",
    "author": "Author Name",
    "date": "Revised 2026-06-26",
    "titlePage": true,
    "metadataPage": true,
    "license": "CC BY 4.0",
    "repository": "https://example.com/project",
    "frontMatter": [
      {
        "title": "AI 辅助声明",
        "source": "AI-PARTICIPATION.short.md",
        "toc": false
      }
    ]
  }
}
```

CLI 可以覆盖配置，包括 `--pdf-engine`、`--paper`、`--margin`、
`--toc-depth`、`--title`、`--subtitle`、`--author`、`--date`、
`--metadata-page`、`--front-matter`、`--title-page`、`--cover-style`
和 `-V key:value`。

本仓库不捆绑 Pandoc 或 LaTeX 发行版。如果本地缺少 PDF 引擎，先交付
`export-md` 中间稿，等本机引擎安装完成后再运行 PDF 渲染。
