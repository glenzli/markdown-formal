# markdown-formal AI 写作规范

这个 skill 用于让 AI 编写和迁移可长期维护的数学 Markdown。它不是单纯的编号规则；日常写作必须同时维护四件事：

- 稳定编号：正文只保存 hash ID，预览渲染当前编号。
- 定义查询：定义不编号不 ref；工具先启发式抽取标准定义，AI 只补非标准定义、别名和不可靠边界。
- 符号表：项目特有 LaTeX 记号写入 `.markdown-formal/symbols.json`。
- 程序校验：写完用 CLI 统一生成 ID、刷新缓存并验证引用。

## 标准流程

写作或迁移前运行：

```bash
npm run formal -- prepare
```

然后读取：

- `.markdown-formal/agent-guide.md`：当前项目的极简操作卡。
- `.markdown-formal/reference-map.md`：显示编号和无编号锚点到 hash ID 的表，以及可复制的章/页引用路径。
- 目标 Markdown 原文。
- 每次修改正文文件时，只检查这些文件内新增、删除、改写的定义和符号约定；不要全书重抽。

写完运行：

```bash
npm run formal -- finish path/to/chapter-or-dir
```

`finish` 会先替换 `tmp-*`，再运行 `verify`。默认只改传入文件或目录；如果本次确实产生跨文件 `@tmp-*` 引用，再显式加 `--all`。

## 文件职责

- `.markdown-formal/reference-map.md`：AI 复制已有 `@h-...` / `@h-....title` 的来源，包括编号对象和无编号锚点。
- `.markdown-formal/dependency-graph.json`：命题/引理/定理/推论之间显式 `@h-...` 依赖的权威 JSON。
- `.markdown-formal/dependency-report.md`：依赖图的人类/AI 审阅报告，区分陈述依赖、证明依赖、跨章/跨卷边、循环和孤立节点。
- `npm run formal -- graph impact|upstream|focus|matrix|bridges|isolated|cycles`：对权威依赖图做局部查询和结构分析；输出给人和 AI 读，不替代 JSON。
- `.markdown-formal/report.md`：lint、verify、迁移报告入口。
- `.markdown-formal/preview-cache.json`：预览运行时缓存，不直接编辑。
- `.markdown-formal/config.json`：语言、扫描排除、跨 book 查询依赖等配置，可人工维护；也是编辑器增强预览的显式启用开关。
- `.markdown-formal/definitions.json`：定义查询例外源表，用于非标准定义、别名/中英互查或不可靠边界。
- `.markdown-formal/symbols.json`：项目特殊符号表源表。

不要把 `.markdown-formal/` 下的生成缓存当成写作源；人工维护入口只有 `config.json`、`definitions.json` 和 `symbols.json`。
编辑器插件只有在项目根目录存在 `.markdown-formal/config.json` 且已有生成的 `.markdown-formal/preview-cache.json` 时才注入导航、定义搜索、符号表和 formal ref 数据；缺失时预览保持原生 Markdown。写作或迁移前运行 `npm run formal -- prepare` 来建立这两个文件。

## 编号语法

把原本手写编号的位置换成稳定 ID：

```markdown
## #tmp-1 谱半径与谱隙

命题 #tmp-2（特征值边界）：如果一个有向算子网络满足 ...
引理 #tmp-3（谱半径引理）：在强连通假设下 ...
定理 #tmp-4（遍历性定理）：任何连通系统 ...
推论 #tmp-5（强混合推论）：由 @tmp-4 可得 ...

公式 #tmp-6：
$$
\rho(T)<1
$$

图 #tmp-7（谱半径示意）：...
表 #tmp-8（稳定性条件）：
```

规则：

- 新增编号对象只写 `#tmp-1`、`#tmp-2`，不要手动生成正式 hash。
- `#h-...` / `#tmp-*` 只出现在编号对象的声明位置，例如小节标题、命题行、公式/图/表 marker；正文引用一律使用 `@h-...` 或 `@h-....title`。
- 引用已有对象时，从 `reference-map.md` 复制 `@h-...` 或 `@h-....title`。不要在行文里写 `命题 #h-...`、`定理 #h-...`、`由 #h-...`；这会被视为声明语法而不是引用语法。
- 引用已有章时，从 `reference-map.md` 复制 `@chapter:path/to/chapter.md`；路径以拥有 `.markdown-formal/` 的 formal root 为基准，不以当前 `workdir` 为基准。
- 章引用可用 `.title` 只显示标题，`.full` 显示“第 x 章：标题”。导读、小结、附录等非正文章用 `@page:path/to/page.md`。
- 写作时可以临时用 `@chapter:./02-main.md` 或 `@chapter:../vol-2/04-main.md`，但运行 `finish` 后应被规范化为 formal-root-relative 路径。
- 不手写“定理 2.1”“小节 3.2”这类会随结构变化的编号。
- 重要引用附近保留自然语言语义，例如“由谱半径引理 `@h-...` 可得”，不要只留下裸 `@h-...`。
- `@h-...` 渲染时已包含类型和编号，不要写成 `定理 @h-...`。
- `## #h-...` 是小节编号和跳转锚点，不生成 recall 预览。
- `命题`、`引理`、`定理`、`推论` 在同一章或同一附录内共享主计数器。
- `公式`、`图`、`表` 各自拥有独立计数器；公式显示为 `公式 (2.1)`，图表显示为 `图 2.1` / `表 2.1`，附录中显示为 `(A.1)` / `A.1`。
- `公式 #tmp-*：` 放在 display math 前；不要把 hash 写进 `$$...$$` 内部。图的 marker 通常放在图片后作为 caption，表的 marker 通常放在表格前作为 caption。
- 英文可用 `Proposition`、`Lemma`、`Theorem`、`Corollary`、`Definition`、`Remark`、`Example`、`Equation`、`Figure`、`Table`。

定理类 recall 只覆盖陈述，不覆盖证明。多行命题、引理、定理、推论应把陈述放在 `证明` / `Proof` 前，工具会从 marker 行收集到证明标记前。

## 定义查询

定义不是编号对象：不加 hash，不参与 `@h-...` ref，也不参与编号迁移。定义是否能被查到，由概念索引决定。

最小流程是“工具先抽，AI 只补”：

1. 工具自动扫描标准 `定义（Term）：...` / `Definition (Term): ...` 行，并用结构启发式收集范围：允许跨 display math、列表和续接段，通常在句号、标题、下一个 marker 或明显新段落处收口。
2. 常规单段或自然收口的标准定义不用重复写入 `.markdown-formal/definitions.json`。
3. AI 只在本次修改范围内处理例外：非标准定义句式、需要别名/中英文互查的定义、自动范围可能截断或过长的多段定义、以及需要稳定预览内容的定义。
4. 对这些例外，AI 在 `.markdown-formal/definitions.json` 中写 `term`、可选 `aliases`、`source` 和 Markdown `content`；`content` 必须来自源码附近，源码改动后同步更新。

标准定义 marker 会自动进入查询索引：

```markdown
定义（演化动力系统）：给定一个由线性算子驱动的网络拓扑，...
Definition (Evolution system): Given a network topology driven by linear operators, ...
**定义（定义域）：** 算子 $T$ 的定义域是...
```

非标准行文定义保持原文风格，并在 `.markdown-formal/definitions.json` 中登记。AI 负责写出查询预览用的 `content`；工具消费和校验这些例外条目。

```json
[
  {
    "term": "定义域",
    "aliases": ["domain"],
    "source": "book1/01-introduction.md:7",
    "content": "定义域是算子实际作用的对象范围。"
  }
]
```

提取规则：

- 识别“称为 X”“所谓 X”“定义其 X”“记作 X”“called X”“denote by X”等真正引入概念的句式。
- 只有后续阅读中需要查询、且工具标准扫描不足以可靠覆盖的概念才进入 `.markdown-formal/definitions.json`；一次性行文不进入。
- `term` 是查询主名，`aliases` 是可选别名，`source` 必须是 `path/to/file.md:line`。
- `content` 是 AI 维护的 Markdown 原文摘录，必须随源码修改同步更新。工具会阻断缺失或明显 stale 的 `content`。
- 标准 marker 不是强制文风，不要为了工具把自然行文机械改写成 `定义（X）：...`。

搜索只匹配定义名和别名，命中后展示 `content`。不要把正文里所有术语出现都改成 ref，也不要把通用词或宽泛段落塞进定义索引。

执行范围：

- 改了某个 Markdown 文件，就只检查这个文件中新增、删除、改写的定义。
- 如果这些定义属于例外条目，对应更新 `.markdown-formal/definitions.json` 中 `source` 指向该文件的条目。
- 标准 `定义（X）` marker 会被工具自动扫描，适合简单定义；需要稳定多段预览、非标准句式、别名或跨语言查询，或者你判断启发式边界不可靠时，写入 `.markdown-formal/definitions.json` 并提供 `content`。
- 不要为了刷新定义索引而每次全书扫描式重写 `.markdown-formal/definitions.json`。

## 符号表

把项目特有的符号约定写入 `.markdown-formal/symbols.json`：

```json
[
  {
    "pattern": "\\sigma(${operator})",
    "meaning": "匹配到的算子的谱。",
    "scope": "book",
    "source": "examples/book1/03-spectral-theory.md:7"
  }
]
```

规则：

- `pattern` 使用 LaTeX，`${name}` 表示一个可捕获参数。
- `meaning` 用自然语言说明这个符号族的约定含义，可以包含 Markdown 和 LaTeX。
- `source` 必须指向引入该约定的正文位置，格式为 `path/to/file.md:line`。
- `scope` 可用 `file`、`chapter`、`book` 或 `workspace`，默认按 book 生效。
- `display` 通常不用写，工具会从 `pattern` 生成搜索展示公式。
- `pattern` 必须是记号本身或完整记号族，括号/方括号要闭合；不要把整条等式、推导片段或缺右边界的公式片段写成 pattern。
- 预览端不把正文公式绑定成可点击 ref；导航栏符号表只展示当前预览文件公式中实际匹配到的符号，搜索框只过滤定义。
- 只记录项目明确约定过的特殊记号；普通变量、通用函数、一次性推导公式、整条等式不进入符号表。

AI 只需要维护源位置、pattern、meaning。参数化展示、LaTeX 渲染和运行时缓存由工具生成；不要在 meaning 里重复列出捕获参数。

## 注和例

`注` 分两类处理：

- 说明类注释只是补充解释，写成普通段落，不加 hash：`注（说明）：...`。
- 非主线事实注释如果本身需要证明、可能被后文引用，或需要稳定锚点，才写 `注 #tmp-*（事实名）：...`。

带 hash 的 `注` 只是锚点，不参与注释编号；预览会隐藏 hash，显示为 `注（事实名）：...`，并保留 recall。不要把它写成“注 x.x”，也不要为了普通说明提前加 hash。

`例` 默认也写成普通段落，不加 hash。只有后文已经明确引用某个例时，才反向把那个条目改成：

```markdown
例 #tmp-1（模型例）：...
```

运行 `finish` 后，被引用的例会作为独立编号块并生成 recall。不要因为“可能以后重要”就提前给普通例子加 hash。

## 目录结构

扩展从路径推断书、卷、章节和附录：

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

- `book1`、`book2` 表示不同书；导航只展示当前书。
- `vol-*`、`volume-*`、`vol-III-*` 表示卷；卷只增加导航层级，不重置正文章号。
- `00-introduction.md`、`intro.md`、`introduction.md` 和 `summary.md` 可导航，但不参与正式编号。
- `NN-title.md` 是正文章。
- `appendix-a-title.md` 是附录；编号显示为 `A.1`、`A.2`。不同卷里的附录 A 可以各自从 `A.1` 开始。
- 定义搜索和当前页符号表默认只查当前 book。跨 book 查询必须在 `.markdown-formal/config.json` 显式声明：

```json
{
  "scan": {
    "exclude": [
      "formal-oet/.lake/**",
      ".context/**",
      "draft/**"
    ]
  },
  "lookup": {
    "bookDependencies": {
      "book3": ["book2"]
    }
  },
  "preview": {
    "ignoreHover": [
      "appendix-b-concepts.md",
      "book1/**/concept-*.md"
    ]
  }
}
```

AI 应从拥有 `.markdown-formal/definitions.json` 和 `.markdown-formal/symbols.json` 的项目根目录运行 `npm run formal`。如果根目录下有构建产物、上下文材料、草稿或其他不属于正式正文体系的 Markdown，先在 `.markdown-formal/config.json` 的 `scan.exclude` 中排除，再运行 `prepare` / `verify`。如果某些概念附录、索引页或超密集引用页不适合 recall hover，在 `.markdown-formal/config.json` 的 `preview.ignoreHover` 中加入这些文件；可以写完整相对路径、裸文件名或 glob。这样只关闭正文里的 `@hash` 悬浮 recall，编号、导航、跳转、定义搜索以及当前页符号表的 LaTeX 预览仍保留。排查空白预览时，可临时设置 `debug.previewLog: true`，查看 `.markdown-formal/preview-debug.log`，定位后再关闭。

跨 book 的 `@h-...` 和 `@chapter:` / `@page:` 引用默认会被 `verify` 阻断。只有当源 book 明确依赖目标 book 时，才在 `.markdown-formal/config.json` 的 `lookup.bookDependencies` 中声明，例如 `"book3": ["book2"]`。

## 旧项目迁移

逐章或逐卷迁移：

1. 先运行 `npm run formal -- prepare`。
2. 把旧的 `1.1 小节`、`命题 1.2`、`定理 1.3` 等编号位置改成 `#tmp-*` marker。
3. 运行 `npm run formal -- finish <file-or-dir>`。
4. 运行 `npm run formal -- migrate-text-refs <file-or-dir>` 做 dry-run。
5. 无歧义后运行 `npm run formal -- migrate-text-refs --apply <file-or-dir>`。
6. 读取 `.markdown-formal/text-ref-migration.md`，手工处理旧 Markdown 链接和缺少 hash 的小节候选。
7. 检查本次范围内的定义和符号约定：标准定义交给工具扫描，非标准定义、别名/中英互查或不可靠边界才维护 `.markdown-formal/definitions.json`；特殊符号约定维护 `.markdown-formal/symbols.json`。
8. 运行 `npm run formal -- verify`。

`migrate-text-refs` 只自动改写带类型或小节语义的旧编号引用，例如 `定理 2.1`、`命题2.2`、`Theorem 2.1`、`公式 (2.1)`、`Figure 2.1`、`表 2.1`、`§2.1`、`第 2.1 节`。不要期待它处理裸 `2.1`、裸 `(2.1)` 或 `第 2 章` / `Chapter 2`：裸数字和章引用都需要 AI 结合上下文判断。章引用应手工改成 `@chapter:path/to/chapter.md`，`audit` 会在目标章唯一时给出建议路径。工具使用边界匹配，避免把 `2.1` 误替换进 `2.12`、`2.1.3` 或 `22.1`。

逐步迁移时，默认会同步处理其他章节指向本章或本卷的 incoming refs。只有明确要把改写限制在目标文件内时才加 `--target-only`。

## 编辑后检查清单

每次完成一个文件或目录的编辑后，按本次修改范围检查：

1. 是否新增、删除或改写了小节、命题、引理、定理、推论、公式、图、表、带锚点的事实型注释或被引用的例？如果有，运行 `npm run formal -- finish <file-or-dir>`；公式 marker 后必须跟 display math，图 marker 附近必须有图片，表 marker 后必须跟 Markdown table。
2. 是否新增、删除、移动或重命名了章节文件？如果有，检查正文里的 `@chapter:` / `@page:` 目标路径是否仍存在，并运行 `npm run formal -- finish <file-or-dir>` 规范化相对输入糖。
3. 是否新增、删除或改写了可查询定义？标准定义交给工具扫描；如果是非标准定义、别名/中英互查或边界不可靠的例外条目，同步 `.markdown-formal/definitions.json` 中 `source` 指向这些文件的条目，并确保每个 AI 维护条目都有最新 `content`。
4. 是否新增、删除或改写了项目特有符号约定？如果有，同步 `.markdown-formal/symbols.json` 中对应 `source`、`pattern`、`meaning`。
5. 是否引入新的跨 book 查询或引用需求？如果有，更新 `.markdown-formal/config.json` 的 `lookup.bookDependencies`。
6. 是否新增或重写了命题/引理/定理/推论的陈述或证明引用？如果要改动某个已有命题，先用 `npm run formal -- graph impact <h-id>` 看下游影响，用 `npm run formal -- graph focus <h-id> --depth 2` 看局部上下游；改完再用 `graph summary` / `graph cycles` / `graph matrix chapter` 审阅结构。机器处理读取 `.markdown-formal/dependency-graph.json`。显式依赖只来自 `@h-...`，不要把 AI 推测边混入这个 JSON。
7. 是否留下 `@tmp-*`、`#tmp-*`、旧文字编号引用、手写章引用或迁移报告中的 unresolved/ambiguous？如果有，先处理再结束。
8. 需要清理建议时运行 `npm run formal -- audit <file-or-dir>`，读取 `.markdown-formal/audit.md`。它只给 AI 审阅清单，不作为提交门禁。
9. 最后运行 `npm run formal -- verify`。
