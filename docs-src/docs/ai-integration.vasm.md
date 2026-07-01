---
vasm:
  alias: markdown-formal-ai-integration
  intent: "Explain how target projects should merge markdown-formal rules into their AI writing instructions."
  compile:
    format: informational
    targetLangs: ["en", "zh-CN"]
---

# AI Integration

`markdown-formal` 应该融合到目标项目已有的 AI 写作流程中。

`skills/` 里的文件不是可执行安装器，而是给目标项目审阅和整合的 AI artifact。通过 VASMC 使用时，应优先从 release 的 `vasm-catalog/vasmc-catalog.yaml` 锁定 `editor` 和 `integrator` exports。

## 融合原则

如果目标项目已经有自己的写作规则，不要把 `markdown-formal` 当成孤立的额外 skill 叠在外面。

更好的方式是把规则融合进项目原生入口：

- `AGENTS.md`
- `CLAUDE.md`
- `GEMINI.md`
- 项目写作 skill
- 项目风格指南
- 仓库 release 指令

目标项目的文风和证明组织仍应保持原样。`markdown-formal` 只提供编号、查询、符号表、依赖图和校验流程。

## 必须保留的能力

[核心模型](../fragments/formal-core-model.vasm.md "@import:inline")

## 最小项目提示

可把下面这段融合到目标项目 AI 指令中：

```text
写作或迁移 formal Markdown 前，运行 npm run formal -- prepare。

读取：
- .markdown-formal/agent-guide.md
- .markdown-formal/reference-map.md
- 目标源码文件

#h-... 和 #tmp-* 只用于声明位置。
正文引用必须使用从 reference-map.md 复制的 @h-...、@h-....title 或 @h-....full。

新增声明使用 tmp-1/tmp-2/...。
不要手动生成 hash ID。

定义不加 hash。
工具会扫描标准 Definition (Term) / 定义（术语）范围。
AI 只为本次编辑文件里的非标准定义、别名、中英互查或不可靠边界更新 .markdown-formal/definitions.json。

只有项目特有 LaTeX 记号进入 .markdown-formal/symbols.json。
不要索引通用变量或完整公式。

编辑后运行 npm run formal -- finish <file-or-dir>。
较大修改还要运行 npm run formal -- verify 和相关 graph 命令。
```

## 目标项目结构

vendoring CLI：

```text
tools/markdown-formal/
  out/cli/formal-tools.js
  package.json

.markdown-formal/
  config.json
  definitions.json
  symbols.json
```

添加项目脚本：

```json
{
  "scripts": {
    "formal": "node tools/markdown-formal/out/cli/formal-tools.js"
  }
}
```

初始化生成数据：

```bash
npm run formal -- prepare
```

运行严格校验：

```bash
npm run formal -- verify
```

## Release 升级流程

目标项目升级 `markdown-formal` 时：

1. 审阅 release 包。
2. 校验 `checksums.txt`。
3. 把新的 `cli/` 复制到 `tools/markdown-formal/`。
4. 把变化后的 `skills/` artifact 融合进项目原生 AI 指令；如果项目使用 VASMC，则通过 catalog dependency 和 lockfile 接入。
5. 运行 `npm run formal -- prepare`。
6. 运行 `npm run formal -- verify`。
7. 运行项目自己的 release 检查。

不要静默拉取或执行远程 skill 更新。
