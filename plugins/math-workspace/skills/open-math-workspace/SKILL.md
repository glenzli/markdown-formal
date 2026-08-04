---
name: open-math-workspace
description: Open the local Math Workspace for a prepared formal Markdown project.
---

# Open Math Workspace

Use `open` when the user asks to read, inspect, or navigate a prepared Math Workspace project. When the user refers to marked material, a marked passage, or “this/these” in a Math Workspace discussion, call `read_marks` before answering, then read the returned Markdown locations from the project. If it returns active marks and you read them, begin the user-facing answer with `已读取 N 个标记。`, using the exact active-mark count. Keep that receipt to one sentence and do not expose mark IDs unless the user asks.

- Pass the current project root when it contains `.math-workspace/config.json`.
- Pass a project-relative `pagePath` when the user identified a chapter to open.
- If no prepared project is available, call the tool without a root so the local Math Workspace launcher can select a recent or local project.
- The tool opens a local, read-only Math Workspace. Use its UI for source selection, definitions, and formulas.
- A Reader mark is a local source locator, not copied Markdown or a second conversation. Resolve active marks with `read_marks`; ongoing discussion, edits, and approvals stay in the native Codex task.
- Prefer narrow tools over broad pasted context: `lookup_formal_object` for one stable object, `inspect_dependencies` for explicit strict relations, `lookup_knowledge` for maintained terms and notation, `inspect_lean_alignment` for observed Lean evidence, and `verify` for deterministic validation.
- Use `read_symbol_audit` only to inspect a cached report that the user already started in Math Workspace; it never initiates model work.
- Treat dependency, Lean, and audit results as evidence for discussion, not as automatic instructions to propagate edits or rewrite source.
