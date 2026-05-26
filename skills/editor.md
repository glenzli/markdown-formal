# markdown-formal AI 写作规范

这个 skill 用于让 AI 编写可长期维护的数学 Markdown。核心原则是：把原本手写编号的位置换成稳定 hash，渲染时再还原为当前编号。

## 最短流程

写作前：

```bash
npm run formal -- prepare
```

然后读取：

- `.markdown-formal/agent-guide.md`
- 目标章节原文
- `.markdown-formal/reference-map.md`

写作时：

- 引用已有编号对象：从 `reference-map.md` 复制 `@h-...` 或 `@h-....title`。
- 新增编号对象：在原本编号位置写 `#tmp-1`、`#tmp-2`。
- 不手写“定理 2.1”“小节 3.2”这类会随结构变化的编号。
- 定义只进入预览搜索索引，不主动把正文中的术语全部引用化。

写完后：

```bash
npm run formal -- finalize path/to/chapter.md
npm run formal -- verify
```

`finalize` 默认只改传入的文件或目录。如果确实写了跨文件的 `@tmp-*` 引用，再显式加 `--all`。

## 轻量语法

小节：

```markdown
## #tmp-1 谱半径与谱隙
```

定理类对象：

```markdown
命题 #tmp-2（特征值边界）：如果一个有向算子网络满足 ...
引理 #tmp-3（谱半径引理）：在强连通假设下 ...
定理 #tmp-4（遍历性定理）：任何连通系统 ...
推论 #tmp-5（强混合推论）：由 @tmp-4 可得 ...
```

定义搜索：

```markdown
定义（演化动力系统）：给定一个由线性算子驱动的网络拓扑，...
Definition (Evolution system): Given a network topology driven by linear operators, ...
```

定义 marker 用于生成预览搜索材料，不需要 hash ID。除非用户明确要求建立引用，AI 不要把所有术语出现都改成显式引用。

## 编号规则

- `命题`、`引理`、`定理`、`推论` 在同一章或同一附录内共享主计数器。
- 英文项目可使用 `Proposition`、`Lemma`、`Theorem`、`Corollary`、`Definition`。
- `## #h-...` 使用小节计数器。
- `定义`、`注`、`例` 不参与主计数器。
- `appendix-a-*.md` 中的编号显示为 `A.1`、`A.2`；不同卷里的附录 A 可以各自从 `A.1` 开始。

## 引用语法

- `@id` 渲染为类型和编号，例如 `定理 3.2`。
- `@id.title` 渲染为标题。
- 未定义引用会在 `npm run formal -- verify` 中报错。

写作建议：

- 数学推导依赖某个命题/引理/定理/推论时，用 `@h-...`。
- 需要自然语言标题时用 `@h-....title`。
- 定义术语一般直接写术语本身；定义查找交给预览里的定义搜索能力。

## 目录结构

扩展从路径推断书、卷、章节和附录。

```text
book1/
  01-introduction.md
  02-main-theory.md
book2/
  vol-1-foundations/
    intro.md
    01-background.md
    appendix-a-estimates.md
    summary.md
```

规则：

- `book1`、`book2` 这类目录表示不同书；导航只展示当前书。
- `vol-*`、`volume-*`、`vol-III-*` 表示卷；卷只增加导航层级，不重置正文章号。
- `intro.md` 和 `summary.md` 是可导航页面，不参与正式编号。
- `NN-title.md` 是正文章。
- `appendix-a-title.md` 是附录。

## 旧项目迁移

逐章或逐卷迁移：

1. 把旧的 `1.1 小节`、`命题 1.2`、`定理 1.3` 等编号位置改成 `#tmp-*` marker。
2. 运行 `npm run formal -- finalize <file-or-dir>`。
3. 运行 `npm run formal -- prepare`。
4. 对旧文字引用运行 `npm run formal -- migrate-text-refs --dry-run <file-or-dir>`。
5. 无歧义后运行 `npm run formal -- migrate-text-refs --apply <file-or-dir>`。
6. 如果要同步其他章节指向本章/本卷的 incoming refs，使用 `--update-refs-all`。
7. 运行 `npm run formal -- verify`。

旧 Markdown 链接不会自动改写；报告会列出建议 ID，AI 检查后手动替换整个链接。
