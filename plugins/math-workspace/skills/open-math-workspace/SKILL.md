---
name: open-math-workspace
description: Open the local Math Workspace for a prepared formal Markdown project.
---

# Open Math Workspace

Use `math_workspace` when the user asks to read, inspect, or navigate a prepared Math Workspace project. When the user pastes an `mwsel_...` handoff id, call `math_workspace_selection_get` before answering.

- Pass the current project root when it contains `.math-workspace/config.json`.
- Pass a project-relative `pagePath` when the user identified a chapter to open.
- If no prepared project is available, call the tool without a root so the local Math Workspace launcher can select a recent or local project.
- The tool opens a local, read-only Math Workspace. Use its UI for source selection, definitions, and formulas.
- A Reader selection’s “Hand off to Codex” action copies a prompt with an `mwsel_...` id. Resolve it with `math_workspace_selection_get`; ongoing discussion, edits, and approvals stay in the native Codex task.
- Prefer `math_workspace_formal_lookup`, `math_workspace_dependency_slice`, `math_workspace_lean_alignment`, and `math_workspace_verify` for narrow project facts rather than requesting broad pasted context.
