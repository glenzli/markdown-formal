# Usage

Language: [English](#english) | [中文](#中文)

<a id="english"></a>

## English

This guide explains the source syntax and normal command workflow for `markdown-formal`.

The short version:

1. Write stable markers where human numbering would normally appear.
2. Use `@h-...` references in prose.
3. Let the CLI generate hash IDs, preview metadata, and reports.

### Core Syntax

Draft with temporary IDs:

```markdown
# #tmp-1 Measure Theory

## #tmp-2 Weak Convergence

Definition (Tight family): A family of probability measures is tight if ...

Theorem #tmp-3 (Prokhorov Criterion): Let \(\mathcal{P}\) be a family of probability measures.

Proof: ...

The implication follows from @tmp-3.
```

After `finish`, temporary IDs are replaced with stable hash IDs:

```markdown
Theorem #h-3f7a1c9d5b0e72aa (Prokhorov Criterion): ...
```

Declaration syntax and reference syntax are intentionally different:

```text
#h-...      declaration
#tmp-*      temporary declaration
@h-...      prose reference
@h-....title title-only reference
@h-....full  label plus title reference
```

Do not use declaration syntax in prose. For example, write `by @h-...`, not `by Theorem #h-...`.

### Numbered Objects

Supported declarations:

```markdown
## #tmp-1 Section Title

Proposition #tmp-2 (Local Estimate): ...

Lemma #tmp-3 (Compactness Lemma): ...

Theorem #tmp-4 (Main Theorem): ...

Corollary #tmp-5 (Uniqueness): ...

Equation #tmp-6:
$$
\|Tx\| \le C\|x\|
$$

Figure #tmp-7 (Commutative diagram): ...

Table #tmp-8 (Parameter ranges):
```

Chinese markers are also supported:

```markdown
命题 #tmp-1（局部估计）：...
引理 #tmp-2（紧性引理）：...
定理 #tmp-3（主定理）：...
推论 #tmp-4（唯一性）：...
公式 #tmp-5：
图 #tmp-6（交换图）：...
表 #tmp-7（参数范围）：
```

Sections are anchors and navigation targets. They do not create recall previews.

Theorem-like objects create recall previews. The preview captures the statement and stops before `Proof` / `证明`.

### Definitions

Definitions are lookup entries, not numbered references.

Standard definitions are scanned automatically:

```markdown
Definition (Bounded operator): A linear map \(T:X\to Y\) is bounded if ...

定义（有界算子）：若线性映射 \(T:X\to Y\) 满足 ...
```

Use `.markdown-formal/definitions.json` only for exceptions:

- nonstandard prose definitions;
- aliases;
- Chinese/English lookup pairs;
- stable multi-paragraph preview content;
- cases where the automatic range is likely unreliable.

Example:

```json
[
  {
    "term": "bounded operator",
    "aliases": ["有界算子"],
    "source": "book/01-foundations.md:42",
    "content": "A bounded operator is a linear map \(T:X\\to Y\) such that \\(\\|Tx\\|\\le C\\|x\\|\\)."
  }
]
```

### Symbols

Project-specific notation belongs in `.markdown-formal/symbols.json`.

```json
[
  {
    "pattern": "\\operatorname{Spec}(${operator})",
    "meaning": "The spectrum of the matched operator.",
    "scope": "book",
    "source": "book/02-operators.md:18"
  }
]
```

Do not index generic variables, standard notation, or complete derivation formulas.

### Normal Workflow

Prepare generated context:

```bash
npm run formal -- prepare
```

Edit a file or directory, then finalize temporary IDs and refresh reports:

```bash
npm run formal -- finish path/to/chapter-or-dir
```

Run the strict gate:

```bash
npm run formal -- verify
```

### Migration Workflow

Dry-run text reference migration:

```bash
npm run formal -- migrate-text-refs path/to/chapter-or-volume
```

Apply text reference migration:

```bash
npm run formal -- migrate-text-refs --apply path/to/chapter-or-volume
```

Dry-run old ID migration:

```bash
npm run formal -- migrate-ids path/to/chapter-or-volume
```

Apply old ID migration:

```bash
npm run formal -- migrate-ids --apply path/to/chapter-or-volume
```

### Dependency Graph

Generate the graph summary:

```bash
npm run formal -- graph summary
```

Inspect one theorem-like object:

```bash
npm run formal -- graph focus <h-id> --depth 2
```

Find downstream impact:

```bash
npm run formal -- graph impact <h-id>
```

Inspect upstream dependencies:

```bash
npm run formal -- graph upstream <h-id>
```

Summarize chapter-level flow:

```bash
npm run formal -- graph matrix chapter
```

The graph records explicit `@h-...` references only. Suggested or inferred mathematical dependencies should be stored separately by the target project.

### Project Structure

The scanner infers books, volumes, chapters, intro pages, summaries, and appendices from paths.

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

Volume directories add a navigation layer. They do not reset chapter numbering.

Appendix numbering is appendix-local, such as `A.1`, `A.2`.

### Configuration

Common `.markdown-formal/config.json`:

```json
{
  "language": "en",
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

Cross-book references and lookup require explicit dependencies in `lookup.bookDependencies`.

### PDF Export

Export formal source to ordinary Markdown:

```bash
npm run formal -- export-md path/to/book --out dist/book.md
```

Export formal source directly to PDF:

```bash
npm run formal -- export-pdf path/to/book --out dist/book.pdf
```

Render an already compiled Markdown file:

```bash
npm run formal -- render-pdf dist/book.md --out dist/book.pdf
```

Use `render-pdf` when a project needs this release flow:

```text
export-md -> project postprocess -> render-pdf
```

PDF settings live under the `pdf` key in `.markdown-formal/config.json`.

<a id="中文"></a>

## 中文

这份文档说明 `markdown-formal` 的源码语法和常用命令流程。

最简流程：

1. 在原本需要人工维护编号的位置写稳定 marker。
2. 在正文中使用 `@h-...` 引用。
3. 由 CLI 生成 hash ID、预览缓存和报告。

### 核心语法

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

### 编号对象

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

### 定义

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

### 符号表

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

### 常规流程

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

### 迁移流程

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

### 依赖图

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

### 项目结构

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

### 配置

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

### PDF 导出

导出为普通 Markdown：

```bash
npm run formal -- export-md path/to/book --out dist/book.md
```

从 formal 源直接导出 PDF：

```bash
npm run formal -- export-pdf path/to/book --out dist/book.pdf
```

渲染已经处理好的普通 Markdown：

```bash
npm run formal -- render-pdf dist/book.md --out dist/book.pdf
```

当目标项目需要自己的 release 后处理时，使用：

```text
export-md -> project postprocess -> render-pdf
```

PDF 选项放在 `.markdown-formal/config.json` 的 `pdf` 字段中。
