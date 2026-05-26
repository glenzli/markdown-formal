# markdown-formal

`markdown-formal` is a VS Code-compatible Markdown preview extension and local CLI for long-form mathematical writing. It separates human-visible numbering from stable machine IDs so chapters can be edited, moved, and migrated without manually maintaining theorem references.

The project is designed for AI-assisted writing:

- Preview renders formal blocks, references, hover recall cards, LaTeX, chapter navigation, volumes, intro/summary pages, and appendices.
- Source Markdown stores stable hash IDs such as `#h-8f2a91c4d7e03b6a`.
- AI agents write new formal objects with temporary IDs such as `tmp-1`, then the CLI finalizes them.
- Generated or migrated content is checked with a strict `verify` gate.

## Basic Syntax

Use container blocks for formal objects:

```markdown
:::theorem {#tmp-1 title="Compactness Criterion"}
Let \(X\) be ...
:::

By @tmp-1, the sequence is tight.
```

Supported block types:

- Numbered together per chapter or appendix: `prop`, `lemma`, `theorem`, `cor`
- Referenceable but not part of the theorem counter: `def`, `remark`, `example`
- Stable section anchors: `section`

References:

- `@h-...` renders the object type and display number.
- `@h-....title` renders the object title.

## AI Workflow

Give AI agents this instruction:

```text
Follow skills/editor.md.
Before writing or migrating, run npm run formal -- prepare.
Read .markdown-formal/agent-guide.md, the target Markdown file, and .markdown-formal/reference-map.md.
Reference existing objects only by copying @h-... or @h-....title from reference-map.md.
Use tmp-1/tmp-2/... for new formal objects; do not generate hash IDs manually.
After editing, run npm run formal -- finalize <file-or-dir>, then npm run formal -- verify.
Keep Markdown and LaTeX unescaped so hover preview can render formulas.
```

Normal edit loop:

```bash
npm run formal -- prepare
npm run formal -- finalize path/to/chapter.md
npm run formal -- verify
```

`prepare` writes generated helper files under `.markdown-formal/`:

- `agent-guide.md`: compact AI workflow card
- `reference-map.md`: display number to hash ID map
- `inventory.full.json`: full content inventory for deeper lookup
- `report.md`: lint/verify details

Do not edit generated `.markdown-formal/` files by hand.

## Migrating Existing Text

For old prose references such as `定理 2.1` or `Theorem 2.1`:

```bash
npm run formal -- prepare
npm run formal -- migrate-text-refs --dry-run path/to/chapter-or-volume
npm run formal -- migrate-text-refs --apply path/to/chapter-or-volume
npm run formal -- verify
```

For old semantic IDs:

```bash
npm run formal -- migrate-ids --dry-run path/to/chapter-or-volume
npm run formal -- migrate-ids --apply path/to/chapter-or-volume
npm run formal -- verify
```

If scoped ID migration would break references outside the target range, the tool refuses to apply. Use a larger closed scope, or update only incoming references:

```bash
npm run formal -- migrate-ids --apply --update-refs-all path/to/chapter-or-volume
```

## Books, Volumes, And Appendices

The scanner infers structure from paths:

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
  volume-2-geometry/
    03-moduli.md
    appendix-a-tables.md
```

Rules:

- `book1`, `book2`, etc. are separate books.
- `vol-*` and `volume-*` add a navigation layer but do not reset chapter numbering.
- `intro.md` and `summary.md` are navigable but not numbered.
- `appendix-a-*.md` uses appendix numbering scoped to the current book and volume.

## Commands

```bash
npm run build
npm run formal -- prepare
npm run formal -- verify
npm run formal -- finalize <file-or-dir> [--all]
npm run formal -- migrate-text-refs --dry-run <file-or-dir>
npm run formal -- migrate-text-refs --apply <file-or-dir>
npm run formal -- migrate-ids --dry-run <file-or-dir>
npm run formal -- migrate-ids --apply <file-or-dir>
npm run formal -- perf-dummy 50 200 --max-ms 2000 --max-heap-mb 256
npm test
```

`verify` is the strict generated/migrated-content gate. It fails on missing refs, duplicate IDs, remaining temporary IDs, non-hash IDs, malformed blocks, unclosed blocks, and unresolved text-reference migration reports.

## Local Release

This project intentionally avoids bundlers and release-time npm dependencies. Build a local directory release with:

```bash
npm run release:local
```

The result is:

```text
dist/markdown-formal-<version>/
  extension/
  cli/
  manifest.json
  checksums.txt
```

For another project, copy `dist/markdown-formal-<version>/cli` into `tools/markdown-formal/`, copy the `skills/` directory into that project, and add:

```json
{
  "scripts": {
    "formal": "node tools/markdown-formal/out/cli/formal-tools.js"
  }
}
```

Check `checksums.txt` before copying release artifacts. Do not auto-install or auto-update skills from remote sources.

## Development

For local extension development, link the repository into your editor extension directory, run:

```bash
npm run build
```

Then reload the editor window.

Before committing:

```bash
npm test
npm run formal -- perf-dummy 50 200 --max-ms 2000 --max-heap-mb 256
```

The CLI and release tooling use only Node built-ins and the existing TypeScript compiler.
