# Markdown Formal Legacy VS Code Extension

This package is the optional VS Code compatibility integration for
[`markdown-formal`](https://gitlab.com/glenzli/markdown-formal).

It keeps the existing editor preview experience available for projects that
need it. New reader capabilities are developed in the local Reader service
first and are not required to appear here.

Build it from the repository root:

```bash
npm run build:vscode-extension
```

Package a VSIX from the repository root:

```bash
npm run package:vsix
```

For the primary local interface, run:

```bash
markdown-formal serve /path/to/project
```
