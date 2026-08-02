---
name: open-markdown-formal-reader
description: Open the local Markdown Formal Reader for a prepared formal Markdown project.
---

# Open Markdown Formal Reader

Use `formal_reader` when the user asks to read, inspect, navigate, or discuss a Markdown Formal project in the Reader.

- Pass the current project root when it contains `.markdown-formal/config.json`.
- Pass a project-relative `pagePath` when the user identified a chapter to open.
- If no prepared project is available, call the tool without a root so the local Reader launcher can select a recent or local project.
- The tool opens a local, read-only Reader. Use the Reader's own UI for source selection, definitions, formulas, and Codex task discussion.
