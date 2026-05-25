# markdown-formal AI 写作规范

这个 skill 用于让 AI 编写可长期维护的数学 Markdown。核心原则是：编号由文件结构和扫描器生成，引用只依赖稳定 ID；正文可以重排、改标题、补内容，但不要手动维护显示编号。

## 语言

项目只要求支持中文和英文。语言由工作区的 `.markdown-formal/config.json` 控制：

```json
{
  "language": "zh"
}
```

- `"zh"`：类型名和导航文案使用中文，例如 `定理 2.1`、`附录 A`。
- `"en"`：类型名和导航文案使用英文，例如 `Theorem 2.1`、`Appendix A`。
- AI 写正文时应跟随 `language` 的语言，但 ID 保持 ASCII。
- 不要为了 hover 预览转义 LaTeX 或 Markdown；引用预览会重新渲染块内容，公式应保留原始 Markdown/LaTeX。

## 目录结构

扩展从路径推断书、卷、章节和附录。

```text
examples/
  book1/
    01-introduction.md
    02-main-theory.md
  book2/
    vol-1-foundations/
      intro.md
      01-background.md
      02-compactness.md
      appendix-a-estimates.md
      summary.md
    volume-2-geometry/
      intro.md
      03-moduli.md
      appendix-a-tables.md
      summary.md
```

规则：

- `book1`、`book2` 这类目录表示不同书；导航只展示当前书。
- `vol-1-*`、`volume-2-*`、`vol-III-*` 表示卷；卷只增加导航层级，不重置正文章号。
- `intro.md` 和 `summary.md` 是可导航页面，不参与正式编号。
- `NN-title.md` 是正文章，例如 `03-index-formula.md` 显示为第 3 章或 Chapter 3。
- `appendix-a-title.md` 是附录；附录编号在当前书和当前卷内生效，例如第一卷可以有 `A.1`、`B.1`，第二卷也可以重新有 `A.1`。

写作约束：

- 正文章号应在同一本书中连续，即使跨卷也不要重置。
- 附录可以按卷重置 `appendix-a`、`appendix-b`。
- 正文可以引用本卷附录；附录可以回引正文。跨卷附录引用应少用，除非文档明确需要。

## 形式化块

所有可引用数学对象必须使用容器块：

```markdown
:::theorem {#b2-thm-compactness title="Compactness Criterion"}
Let \(X\) be ...
:::
```

要求：

- 起始行必须是 `:::type {#id title="..."}`，结束行必须是独立的 `:::`。
- `title` 可选，但推荐给 theorem/lemma/prop/cor 写标题。
- 块内可以包含段落、列表、行内/块级 LaTeX、普通 Markdown 引用。
- 不要把显示编号写进标题，例如不要写 `title="Theorem 2.1"`。

支持类型：

- 递增编号：`prop`、`lemma`、`theorem`、`cor`。它们在同一章或同一附录内共享计数器。
- 非递增编号：`def`、`remark`、`example`。它们可引用、可 hover，但不占用主定理计数器。
- 小节：`section`。用于需要稳定引用的小节，而不是普通 Markdown 标题。

## ID 规范

ID 是长期引用锚点，必须稳定、全局唯一、ASCII。

推荐格式：

- `b1-thm-fixed-point`
- `b2-lem-spectral-gap`
- `b3-app1-lem-cutoff`
- `b3-app2-ex-table-row`

规则：

- 不要使用显示编号作为 ID，例如不要写 `#theorem-2-1`。
- 不要在普通改写、重命名标题、移动章节时改 ID。
- AI 新增块时应先搜索现有 ID，避免重复。
- 对附录 ID 加入卷或主题提示，例如 `app1`、`app2`，因为不同卷可以同时存在 Appendix A。

## 引用语法

- `@id` 渲染为类型和编号，例如 `定理 3.2` 或 `Theorem 3.2`。
- `@id.title` 渲染为该块标题。
- 未定义引用会在预览中标红；AI 写完后应检查是否有 missing ref。

写作建议：

- 正文推导优先使用 `@id`，让编号由系统生成。
- 需要自然语言更流畅时使用 `@id.title`。
- 不要手写“定理 2.1”“附录 A.1”这类会随结构变化的文本，除非是在解释编号机制的示例中。

## AI 写作流程

1. 先确认当前文件路径属于正文章、intro/summary，还是附录。
2. 搜索相关已有 ID，复用引用，不要重复定义同一对象。
3. 新增正式对象时创建稳定 ID，并使用容器块。
4. 保持 LaTeX 原样，避免 HTML 转义和过度改写。
5. 写完后运行扫描或构建，检查重复 ID、缺失引用、错误文件命名。
