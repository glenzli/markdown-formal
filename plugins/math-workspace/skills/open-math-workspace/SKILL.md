---
name: open-math-workspace
description: Open the local Math Workspace for a prepared formal Markdown project.
---

# Open Math Workspace

Use `math_workspace` when the user asks to read, inspect, or navigate a prepared Math Workspace project. When the user refers to marked material, a marked passage, or “this/these” in a Math Workspace discussion, call `math_workspace_discussion_marks_get` before answering, then read the returned Markdown locations from the project. If it returns active marks and you read them, begin the user-facing answer with `已读取 N 个标记。`, using the exact active-mark count. Keep that receipt to one sentence and do not expose mark IDs unless the user asks.

- Pass the current project root when it contains `.math-workspace/config.json`.
- Pass a project-relative `pagePath` when the user identified a chapter to open.
- If no prepared project is available, call the tool without a root so the local Math Workspace launcher can select a recent or local project.
- The tool opens a local, read-only Math Workspace. Use its UI for source selection, definitions, and formulas.
- A Reader mark is a local source locator, not copied Markdown or a second conversation. Resolve active marks with `math_workspace_discussion_marks_get`; ongoing discussion, edits, and approvals stay in the native Codex task.
- Prefer `math_workspace_formal_lookup`, `math_workspace_dependency_slice`, `math_workspace_lean_alignment`, and `math_workspace_verify` for narrow project facts rather than requesting broad pasted context.
