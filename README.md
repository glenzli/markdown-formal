# markdown-formal

`markdown-formal` is a VS Code-compatible Markdown preview extension and local CLI for long-form mathematical writing. It separates human-visible numbering from stable machine IDs so chapters can be edited, moved, and migrated without manually maintaining theorem references.

The project is designed for AI-assisted writing:

- Preview renders lightweight numbered markers, references, LaTeX, chapter navigation, volumes, intro/summary pages, appendices, definition lookup, and declared-symbol recall.
- Source Markdown stores stable hash IDs for numbered objects, such as `#h-8f2a91c4d7e03b6a`.
- AI agents write new numbered markers with temporary IDs such as `tmp-1`, then the CLI finalizes them.
- Generated or migrated content is checked with a strict `verify` gate.

## Basic Syntax

Put the stable ID where a human-maintained number used to be:

```markdown
## #tmp-1 Compactness

定理 #tmp-2（Compactness Criterion）：Let \(X\) be ...

By @tmp-2, the sequence is tight.
```

Supported markers:

- Sections: `## #h-... Title`
- Numbered together per chapter or appendix: `命题 #h-...`, `引理 #h-...`, `定理 #h-...`, `推论 #h-...`
- English numbered markers are also supported: `Proposition #h-...`, `Lemma #h-...`, `Theorem #h-...`, `Corollary #h-...`
- Definition lookup entries: `定义（Term）：...` or `Definition (Term): ...`
- Also recognized: `注 #h-...`, `例 #h-...`

References:

- `@h-...` renders the object type and display number.
- `@h-....title` renders the object title.
- Definition names are indexed for lookup; definition bodies are shown after a name match but are not used as broad search text.

Project-specific symbols can be declared in `formal-symbols.json`:

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

Only record explicit local notation conventions. Do not list generic math notation or whole derivation formulas. `source`, `pattern`, and `meaning` are required; `display` is optional and normally generated from the pattern.

## AI Workflow

Give AI agents this instruction:

```text
Follow skills/editor.md.
Before writing or migrating, run npm run formal -- prepare.
Read .markdown-formal/agent-guide.md, the target Markdown file, and .markdown-formal/reference-map.md.
Reference existing numbered objects only by copying @h-... or @h-....title from reference-map.md.
Keep a short natural-language cue near important refs, such as "by the spectral-radius lemma `@h-...`"; do not leave important prose as only a bare `@h-...`.
Use tmp-1/tmp-2/... for new markers; do not generate hash IDs manually.
Use plain definition markers for terms; lookup is by definition name, not by scanning every definition body.
Maintain formal-symbols.json only for explicit project-specific notation conventions, not ordinary formulas.
After editing, run npm run formal -- finish <file-or-dir>.
Keep Markdown and LaTeX unescaped.
```

Normal edit loop:

```bash
npm run formal -- prepare
npm run formal -- finish path/to/chapter.md
```

Definition and symbol lookup is scoped to the current book by default. If one book intentionally depends on another, declare it in `.markdown-formal/config.json`:

```json
{
  "lookup": {
    "bookDependencies": {
      "book3": ["book2"]
    }
  }
}
```

`prepare` writes generated helper files under `.markdown-formal/`:

- `agent-guide.md`: compact AI workflow card
- `reference-map.md`: display number to hash ID map
- `preview-cache.json`: runtime preview/navigation/definition/symbol lookup cache
- `report.md`: lint/verify details

Do not edit generated `.markdown-formal/` files by hand, except `.markdown-formal/config.json`.

## Migrating Existing Text

For old prose references such as `定理 2.1` or `Theorem 2.1`:

```bash
npm run formal -- prepare
npm run formal -- migrate-text-refs path/to/chapter-or-volume
npm run formal -- migrate-text-refs --apply path/to/chapter-or-volume
npm run formal -- verify
```

Scoped text-reference migration has two ranges:

- Numbered-object scope: the chapter or volume passed on the command line.
- Reference rewrite scope: where textual references are rewritten.

By default, target files are migrated against the full reference map, while non-target files only rewrite incoming references that point into the target scope. This keeps gradual migration reviewable without leaving incoming references behind.

If you explicitly want the older, narrower behavior, restrict the rewrite to the target files:

```bash
npm run formal -- migrate-text-refs --target-only path/to/chapter-or-volume
npm run formal -- migrate-text-refs --apply --target-only path/to/chapter-or-volume
```

`migrate-text-refs` automatically rewrites unambiguous numbered references, including common section forms such as `第 2.1 节`, `§2.1`, and `Sec. 2.1`. It does not rewrite old Markdown links in place because formal refs render as links already; those links are listed in `.markdown-formal/text-ref-migration.md` with suggested IDs.

The same report lists plain `##`/`###` section headings that may need numbered markers. For referenced sections, write the heading as `## #tmp-* Title`, run `finish`, then rerun the migration.

For old semantic IDs:

```bash
npm run formal -- migrate-ids path/to/chapter-or-volume
npm run formal -- migrate-ids --apply path/to/chapter-or-volume
npm run formal -- verify
```

Scoped ID migration also updates incoming references by default. If you explicitly want to touch only the target files, use `--target-only`; the tool will refuse to apply if that would leave outside references pointing at removed IDs:

```bash
npm run formal -- migrate-ids --apply --target-only path/to/chapter-or-volume
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
npm run formal -- finish <file-or-dir> [--all]
npm run formal -- migrate-text-refs <file-or-dir>
npm run formal -- migrate-text-refs --apply <file-or-dir>
npm run formal -- migrate-text-refs --target-only <file-or-dir>
npm run formal -- migrate-text-refs --apply --target-only <file-or-dir>
npm run formal -- migrate-ids <file-or-dir>
npm run formal -- migrate-ids --apply <file-or-dir>
npm run formal -- migrate-ids --apply --target-only <file-or-dir>
npm run formal -- perf-dummy 50 200 --max-ms 2000 --max-heap-mb 256
npm test
```

`verify` is the strict generated/migrated-content gate. It fails on missing refs, duplicate IDs, remaining temporary IDs, non-hash IDs, and unresolved text-reference migration reports.

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

Check `checksums.txt` before copying release artifacts. Do not auto-install or auto-update skills from remote sources. Put the prompt block from **AI Workflow** into the target project's AI instructions, such as `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, or the repository README.

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
