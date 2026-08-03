---
vasm:
  alias: math-workspace-usage
  intent: "Document math-workspace syntax, command workflow, configuration, graph, migration, and PDF export usage."
  compile:
    format: informational
    targetLangs: ["en", "zh-CN"]
---

# Usage

这份文档说明 `math-workspace` 的源码语法和常用命令流程。

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

工具还会识别明确命名的概念/术语附录，例如 `appendix-*-concepts.md`、glossary、terminology 或中文概念表。此类页面中，`术语 | 定义` / `Term | Definition` 表格与最末级概念条目会作为补充查询条目。`prepare` 会生成 `.math-workspace/project-analysis.json` 和 `.math-workspace/project-analysis.md`，列出被采用的概念、符号和 summary 页面；Math Workspace 在内存中同步重建这份结构，并把当前 book 的来源带入 Codex 讨论上下文。

这些条目是派生索引，不是新的写作源，也不会由工具从普通正文猜测术语或符号含义。

只有例外情况才写入 `.math-workspace/definitions.json`：

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

只有项目明确约定且语义发生变化的记号才写入 `.math-workspace/symbols.json`。

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

不要索引普通变量、通用记号或完整推导公式。检测到的符号/记号附录会出现在项目知识摘要中，但不会自动推导 `pattern` 或 `meaning`。

## 常规流程

生成上下文：

```bash
npm run workspace -- prepare
```

编辑文件或目录后，固化临时 ID 并刷新报告：

```bash
npm run workspace -- finish path/to/chapter-or-dir
```

`finish` 已执行校验。只有直接使用 `finalize`、执行迁移，或需要独立 release 门禁时，再运行：

```bash
npm run workspace -- verify
```

## Math Workspace

Math Workspace 是 `math-workspace` 引擎之上的本地工作区界面。它在内存中扫描已经存在 formal 配置的项目，不写入源码或 `.math-workspace/` 产物：

```bash
npm run workspace -- serve /path/to/project
```

也可以不传项目路径，打开本机项目启动台：

```bash
npm run workspace -- serve
```

启动台可以从系统目录选择器选择项目，或重开最近项目。选择的目录必须已有 `.math-workspace/config.json`；最近记录只保存在本机用户状态目录，不写入项目源码或 `.math-workspace/`。网页只提交最近项目的索引，目录路径始终由本地 Math Workspace 服务处理。

命令会打印一个仅绑定 `127.0.0.1` 的本地 URL。可在 Codex 的本地浏览器侧栏或普通浏览器中打开。Math Workspace 提供：

- 多书/多卷/章节导航；
- 当前页目录；
- 仅在需要时加载的命题类 recall；
- 全书定义查找与当前页符号表；
- 命题、引理、定理、推论和带 hash 补充注释旁的页内依赖标记；
- 源文件改动后的实时刷新。

依赖标记只读取显式 `@h-...` 关系。圆点上方的短线表示该陈述或证明显式引用了 formal 对象（可为小节、定义或命题）；下方纵线表示后续依赖对象依赖它，分叉表示多个直接下游。主线命题使用常规颜色；带 hash 的、可证明的补充注释使用低强调度的注释颜色。灰色是没有下游对象的终点，蓝色表示被直接引用，绿色分叉表示既有显式前提也被后续对象引用。悬停可查看引用数与传递影响范围；这些是结构信号，不等同于数学重要性。权威依赖图包含命题/引理/定理/推论之间的边，也包含带 hash 补充注释的入边、出边；普通 `注（...）` 不进入图，也没有标记。

若本机 Codex CLI 已安装并登录，可在选中正文或公式后打开 Math Workspace 的临时讨论浮窗。首条消息会附带相对路径、源码行范围、选中 Markdown、项目根和只读工具边界；后续消息保留该上下文。临时讨论是不可持久化的，不写入书稿或本机任务状态。每条助手结论旁的“复制引用”会生成一段包含来源、选区、问题和结论的 Markdown，可粘贴到你选择的任一原生 Codex 任务；Math Workspace 不绑定或直接向任务发送消息。Math Workspace 不承接 Codex 的工具审批，需要工具时应回到 Codex 继续。

项目需要先有 `.math-workspace/config.json`；首次使用可运行 `prepare`。Math Workspace 不要求预先生成 `workspace-index.json`。

旧 VS Code 预览已归档；项目阅读与交互统一通过本地 Math Workspace 提供。

## Codex MCP 入口

Math Workspace 可作为独立本地客户端运行，也可通过 Codex MCP 打开。MCP 只负责启动或复用本机工作区，并返回可由 Codex 内置浏览器直接访问的 localhost URL；它不嵌入或复制工作区的渲染、索引或讨论实现。

CLI 入口是：

```bash
math-workspace mcp
```

默认项目是 MCP 进程的工作目录。若需要固定项目根，可传：

```bash
math-workspace mcp --root /path/to/project
```

仓库包含一个可安装的 Codex plugin。开发时先确保 `math-workspace` 在 `PATH` 中（例如 `npm link`），然后将仓库根目录注册为 marketplace：

```bash
codex plugin marketplace add /path/to/math-workspace
codex plugin add math-workspace@personal
```

发布版本同样可以从安装包根目录添加 marketplace。插件调用 `math_workspace`：它可直接打开当前项目或某个项目相对 Markdown 页面；没有可用项目时会打开 Math Workspace 的本机项目启动台。

MCP 与 Math Workspace 一样只绑定 `127.0.0.1`，不写入书稿或 `.math-workspace/` 产物。

## AI 工作流接入

AI 规则不再放在单独的 public doc 中。目标项目应直接读取随包发布的 AI artifacts：

```text
skills/editor.md      # 具体写作和迁移规则
skills/integrator.md  # 如何融合进目标项目原生 AI 指令
skills/lean-formalization.md  # Lean 锚定、实现与验证规则
```

如果通过 npm 安装，对应路径是：

```text
node_modules/math-workspace/skills/editor.md
node_modules/math-workspace/skills/integrator.md
node_modules/math-workspace/skills/lean-formalization.md
```

如果目标项目使用 VASMC，使用 catalog 锁定这两个 artifact：

```bash
vasmc add --catalog node_modules/math-workspace/vasm-catalog/vasmc-catalog.yaml --export editor --alias math-workspace-editor
vasmc add --catalog node_modules/math-workspace/vasm-catalog/vasmc-catalog.yaml --export integrator --alias math-workspace-integrator
```

对于 release bundle，把上面的 catalog 路径替换为：

```text
dist/vasm-catalog/vasmc-catalog.yaml
```

CLI 可打印当前安装中的关键路径：

```bash
npm run workspace -- paths
```

不要自动拉取远端 skill，也不要把 integrator 原样追加到目标 prompt 末尾。应先审阅 artifact，再把规则融合到目标项目已有的 `AGENTS.md`、写作 skill、风格指南或 release 指令中。

## 迁移流程

试运行文字编号引用迁移：

```bash
npm run workspace -- migrate-text-refs path/to/chapter-or-volume
```

应用文字编号引用迁移：

```bash
npm run workspace -- migrate-text-refs --apply path/to/chapter-or-volume
```

试运行旧 ID 迁移：

```bash
npm run workspace -- migrate-ids path/to/chapter-or-volume
```

应用旧 ID 迁移：

```bash
npm run workspace -- migrate-ids --apply path/to/chapter-or-volume
```

## 依赖图

生成依赖图摘要：

```bash
npm run workspace -- graph summary
```

查看某个命题类对象或带 hash 补充注释的局部图：

```bash
npm run workspace -- graph focus <h-id> --depth 2
```

查看下游影响范围：

```bash
npm run workspace -- graph impact <h-id>
```

查看上游依赖：

```bash
npm run workspace -- graph upstream <h-id>
```

汇总章节层面的依赖流：

```bash
npm run workspace -- graph matrix chapter
```

依赖图只记录显式 `@h-...` 引用。报告把主线 theorem-like 对象与带 hash 补充注释分别统计，避免旁支事实改变主线结论；普通 `注（...）` 不成为节点。AI 或领域工具推测出的数学依赖应由目标项目单独维护，不要混入 canonical graph。

## Lean 锚点

在 `.math-workspace/config.json` 中声明 Lean 项目后，`prepare` 会扫描配置源码目录内的 `.lean` 文件，读取具名声明 docstring 中的稳定 hash，并生成：

```text
.math-workspace/lean-index.json
.math-workspace/lean-report.md
.math-workspace/lean-contracts.json        # 显式捕获后才出现
.math-workspace/lean-build.json            # 执行 build 后才出现
.math-workspace/lean-dependency-graph.json # 执行 dependencies 后才出现
.math-workspace/lean-dependency-report.md  # 执行 dependencies 后才出现
```

常用命令：

```bash
npm run workspace -- lean scan
npm run workspace -- lean coverage
npm run workspace -- lean verify
npm run workspace -- lean capture
npm run workspace -- lean build [--project <key>]
npm run workspace -- lean dependencies
```

`scan` 重建索引，`coverage` 打印锚点报告，`verify` 在锚点无法解析、源码根不可读或 docstring 后没有受支持的具名声明时失败。`capture` 把当前正文类型、标题、内容与锚定声明签名作为显式审阅基线；基线后的正文或声明改动会显示为漂移。`build` 在每个已配置项目根执行 `lake build [target]` 并记录结果；任何源码变动都会使旧构建结果过期。

`dependencies` 通过 Lean elaborator 读取锚定声明的直接类型与证明值引用，并只与正文中显式、严格的 `@h-...` 边比较。Markdown-only 边是需要核对的候选；Lean-only 边通常是实现细节或复用支撑，仅作为补充上下文。两者都不自动构成数学冲突，也不证明语义等价。

Reader 在命题正文与关系图节点上用轻量 `L` 表示存在一个或多个 Lean 声明锚点。点击正文中的 `L` 可查看锚定声明、正文/声明契约、最近构建和依赖比对状态。这个标记不声称完整形式化或证明覆盖；覆盖数字只统计配置的 `coverageTypes`，不能替代范围声明。

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

常见 `.math-workspace/config.json`：

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
  "lean": {
    "projects": [
      {
        "key": "formal-book",
        "root": "formal-book",
        "sourceRoots": ["FormalBook"],
        "target": "FormalBook",
        "module": "FormalBook",
        "anchorPrefix": "Book anchor:"
      }
    ],
    "coverageTypes": ["theorem", "lemma", "prop", "cor", "remark"]
  },
  "render": {
    "pageHeadingStyle": "label-title"
  }
}
```

跨 book 引用和查询必须在 `lookup.bookDependencies` 中显式声明。

Lean 项目的 `root` 与 `sourceRoots` 都相对于 Math Workspace 项目根；`target` 是 `lake build` 的可选目标，`module` 是依赖查询时导入的模块（未设置时使用 `target`）；`anchorPrefix` 必须与 Lean docstring 中使用的前缀一致。`coverageTypes` 控制报告中的候选正文类型，不改变锚点解析。

## PDF 导出

先把 formal 源导出为普通 Markdown，再交给其他发布流程处理：

```bash
npm run workspace -- export-md path/to/book --out dist/book.md
```

导出时保留源目录结构：

```bash
npm run workspace -- export-md-split path/to/book --out dist/public
```

使用本机 Pandoc/LaTeX 引擎从 formal 源直接导出 PDF：

```bash
npm run workspace -- export-pdf path/to/book --out dist/book.pdf
```

渲染已经处理好的普通 Markdown：

```bash
npm run workspace -- render-pdf dist/book.md --out dist/book.pdf
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

PDF 选项放在 `.math-workspace/config.json` 的 `pdf` 字段中：

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
