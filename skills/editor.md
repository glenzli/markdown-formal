# markdown-formal AI 写作规范

这个 skill 用于让 AI 编写可长期维护的数学 Markdown。核心原则是：源文件只保存稳定 hash ID，编号由文件结构和扫描器生成；AI 写长文时可以先用临时 ID，写完后由工具一次性转换。

## 最短流程

写作前：

```bash
npm run formal -- prepare
```

然后读取：

- `.markdown-formal/agent-guide.md`，用于确认当前工具入口和迁移策略。
- 目标章节原文。
- `.markdown-formal/reference-map.md`，用于把“定理 2.1 / Theorem 2.1”映射到 hash ID。

写作时：

- 引用已有对象：只能使用 `reference-map.md` 中已有的 hash ID。
- 新增对象：使用 `tmp-1`、`tmp-2`、`tmp-3` 这样的临时 ID。
- 新增对象之间互相引用，也使用这些临时 ID。

写完后：

```bash
npm run formal -- finalize path/to/chapter.md
npm run formal -- verify
```

`finalize` 默认只改传入的文件或目录。如果确实写了跨文件的 `@tmp-*` 引用，再显式加 `--all`。

`verify` 是生成后/迁移后的严格 gate。如果报错，读取 `.markdown-formal/report.md`；如果是文字引用迁移遗留问题，读取 `.markdown-formal/text-ref-migration.md`。

旧文档如果已经有大量“定理 2.1 / Theorem 2.1”文字引用，先不要手工替换。使用迁移模式：

```bash
npm run formal -- migrate-text-refs --dry-run path/to/book-or-chapter
npm run formal -- migrate-text-refs --apply path/to/book-or-chapter
```

工具只会自动替换能从 `reference-map.md` 唯一匹配到的文字编号；歧义和找不到的项会写入 `.markdown-formal/text-ref-migration.md`，由 AI 读原文后修。

## 语言

项目只要求支持中文和英文。语言由 `.markdown-formal/config.json` 控制：

```json
{
  "language": "zh"
}
```

- `"zh"`：类型名和导航文案使用中文，例如 `定理 2.1`、`附录 A`。
- `"en"`：类型名和导航文案使用英文，例如 `Theorem 2.1`、`Appendix A`。
- AI 写正文时应跟随 `language` 的语言，但正式 ID 始终保持 ASCII hash。
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

## 形式化块

所有可引用数学对象必须使用容器块：

```markdown
:::theorem {#tmp-1 title="Compactness Criterion"}
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

正式 ID 必须是纯 hash：

```markdown
:::theorem {#h-8f2a91c4d7e03b6a title="遍历性定理"}
...
:::
```

AI 不手动生成正式 hash。新增内容时只使用临时 ID：

```markdown
由 @tmp-1 可得 @tmp-2。

:::lemma {#tmp-1 title="局部谱间隙估计"}
...
:::

:::theorem {#tmp-2 title="遍历性定理"}
...
:::
```

`finalize` 会把 `tmp-*` 批量替换成不冲突的 `h-...`，并同步替换所有 `@tmp-*` / `@tmp-*.title`。

规则：

- 不要使用显示编号作为 ID，例如不要写 `#theorem-2-1`。
- 不要使用语义 ID，例如不要写 `#b3-thm-duality`。
- 不要手动编辑 `.markdown-formal/labels.json`、`pages.json`、`reference-map.md`。
- 如果用户用“定理 2.1”沟通，先从 `.markdown-formal/reference-map.md` 找到对应 hash ID。

## 引用语法

- `@id` 渲染为类型和编号，例如 `定理 3.2` 或 `Theorem 3.2`。
- `@id.title` 渲染为该块标题。
- 未定义引用会在 `npm run formal -- lint` / `npm run formal -- verify` 中报错。

写作建议：

- 正文推导优先使用 `@h-...`，让编号由系统生成。
- 需要自然语言更流畅时使用 `@h-....title`。
- 不要手写“定理 2.1”“附录 A.1”这类会随结构变化的文本，除非是在解释编号机制的示例中。

## AI 检查清单

1. 写作前运行 `npm run formal -- prepare`。
2. 读取 `.markdown-formal/agent-guide.md`、目标原文和 `.markdown-formal/reference-map.md`。
3. 引用已有对象时，从 reference map 复制 hash ID。
4. 新增对象使用 `tmp-1/tmp-2/...`。
5. 保持 LaTeX 原样，避免 HTML 转义和过度改写。
6. 写完运行 `npm run formal -- finalize <file>`。
7. 运行 `npm run formal -- verify`。
8. 如果仍有错误，读取 `.markdown-formal/report.md` 或 `.markdown-formal/text-ref-migration.md`。

## 旧项目迁移模式

当旧项目使用纯文字编号引用时，AI 按这个流程修正：

1. 先选择一个可检查的迁移范围，例如单章文件或单卷目录。
2. 把范围内可识别的定理、引理、命题等对象包成 formal block，新增块 ID 可以用 `tmp-*`。
3. 运行 `npm run formal -- finalize <file-or-dir>`，把新块 ID 固化为 hash。
4. 运行 `npm run formal -- prepare`，生成编号/hash 对照表。
5. 运行 `npm run formal -- migrate-text-refs --dry-run <file-or-dir>` 查看范围内会替换哪些“定理 2.1”文字引用。
6. 如果 dry-run 报告无歧义，运行 `npm run formal -- migrate-text-refs --apply <file-or-dir>`。
7. 对 `.markdown-formal/text-ref-migration.md` 中的 unresolved/ambiguous 项，AI 结合原文上下文手工改成正确 `@h-...`。
8. 最后运行 `npm run formal -- verify`。

迁移是默认 scoped 的：传入单章就只改单章，传入单卷目录就只改单卷。这样可以逐章/逐卷审查，不必一次性重写全书。

如果旧项目已经有 formal block，但 ID 是语义 ID 或显示编号 ID，用：

```bash
npm run formal -- migrate-ids --dry-run path/to/chapter-or-volume
npm run formal -- migrate-ids --apply path/to/chapter-or-volume
```

`migrate-ids` 只迁移目标范围内的定义。若目标范围内的旧 ID 被范围外章节引用，工具会拒绝 scoped apply，避免造成断链。此时有三种选择：

- 扩大迁移范围到一个闭合的章/卷。
- 只迁移目标定义，但同步更新全书中指向这些定义的引用：

```bash
npm run formal -- migrate-ids --apply --update-refs-all path/to/chapter-or-volume
```

- 暂缓迁移这些被外部引用的定义，等对应引用范围一起处理。

只有明确要全项目转换时才使用：

```bash
npm run formal -- migrate-ids --dry-run --all
npm run formal -- migrate-ids --apply --all
```
