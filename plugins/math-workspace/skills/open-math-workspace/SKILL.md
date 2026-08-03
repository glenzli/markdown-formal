---
name: open-math-workspace
description: Open the local Math Workspace for a prepared formal Markdown project.
---

# Open Math Workspace

Use `math_workspace` when the user asks to read, inspect, navigate, or discuss a prepared Math Workspace project.

- Pass the current project root when it contains `.math-workspace/config.json`.
- Pass a project-relative `pagePath` when the user identified a chapter to open.
- If no prepared project is available, call the tool without a root so the local Math Workspace launcher can select a recent or local project.
- The tool opens a local, read-only Math Workspace. Use its UI for source selection, definitions, formulas, and Codex task discussion.
