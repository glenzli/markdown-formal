# markdown-formal

`markdown-formal` is a VS Code-compatible Markdown preview extension and local CLI for long-form mathematical writing. It separates human-visible numbering from stable machine IDs so chapters can be edited, moved, and migrated without manually maintaining theorem references.

The project is designed for AI-assisted writing:

- Preview renders lightweight numbered markers, references, LaTeX, chapter navigation, volumes, intro/summary pages, appendices, definition lookup, and a current-page declared-symbol table.
- The CLI generates theorem-like dependency graph data from explicit `@h-...` references, split into statement and proof edges.
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

- Sections: `## #h-... Title` render as numbered anchors and links, but do not generate hover recall previews.
- Numbered together per chapter or appendix: `命题 #h-...`, `引理 #h-...`, `定理 #h-...`, `推论 #h-...`
- Separate counters per chapter or appendix: `公式 #h-...：`, `图 #h-...（Caption）：...`, `表 #h-...（Caption）：`
- English numbered markers are also supported: `Proposition #h-...`, `Lemma #h-...`, `Theorem #h-...`, `Corollary #h-...`, `Equation #h-...`, `Figure #h-...`, `Table #h-...`
- Definition lookup uses a tool-first, AI-exception workflow. Standard `定义（Term）：...` / `Definition (Term): ...` lines are scanned automatically with structural range heuristics; nonstandard prose definitions, aliases, bilingual lookup, or unreliable boundaries are indexed through `.markdown-formal/definitions.json`.
- Remarks have two modes: explanatory remarks stay plain as `注（...）` / `Remark (...)`, while non-mainline fact remarks that need a proof or later citation use `注 #h-...（...）` / `Remark #h-... (...)`. Anchored fact remarks may also be written inside standard blockquotes as `> 注 #h-...（...）`; they hide the hash, do not render a remark number, and do not enter the preview contents menu.
- Examples stay plain by default; only add `#h-...` when an example is explicitly cited. Cited examples use their own example counter.

Hover recall is generated for propositions, lemmas, theorems, corollaries, anchored fact remarks, and explicitly cited examples. For theorem-like blocks, the preview captures the statement and stops before `证明` / `Proof`.

Equations, figures, and tables use the same stable-ID model without wrapping the surrounding content:

```markdown
公式 #tmp-3：
$$
\rho(T)<1
$$

![Feedback loop](assets/feedback.svg)

图 #tmp-4（Feedback loop）：The loop weight controls the spectral radius.

表 #tmp-5（Stability conditions）：

| Condition | Meaning |
| --- | --- |
| $\rho(T)<1$ | Convergence |
```

Equations render as `公式 (2.1)` / `Equation (2.1)`, while figures and tables render as `图 2.1` / `Figure 2.1` and `表 2.1` / `Table 2.1`. In appendices they render as `(A.1)`, `图 A.1`, and `表 A.1`.

References:

- `@h-...` renders the object type and display number.
- `@h-....title` renders the object title.
- A chapter, intro, summary, or appendix page may put a hash on its unique highest-level heading, for example `# #h-... Chapter Title` or `## #tmp-* Chapter Title`. The hash is hidden in preview and does not create a section number.
- Page hashes use the same reference syntax: `@h-...` renders the page label, `@h-....title` renders only the title, and `@h-....full` renders label plus title.
- `@chapter:path/to/chapter.md` and `@page:path/to/page.md` remain available as path-based compatibility refs, using paths relative to the formal root that owns `.markdown-formal/`. Prefer page hashes once a page heading has one.
- Definitions do not have hash IDs and do not participate in references. Lookup is driven by definition names in the concept index; definition bodies are not used as broad search text. Rendered Markdown/LaTeX previews are generated only for definitions in the currently previewed file, while cross-file matches focus on location and jump.

Important syntax split: `#h-...` / `#tmp-*` is declaration syntax and belongs only where the object is defined, such as `命题 #tmp-*（Title）：...`, `## #tmp-* Title`, or the unique top page heading. Running prose references must use `@h-...`, `@h-....title`, or `@h-....full`; do not write `命题 #h-...`, `Theorem #h-...`, or `由 #h-...` as a reference.

During drafting, `./chapter.md` and `../vol-2/chapter.md` are accepted as input sugar for page refs. `finish` normalizes them to formal-root-relative paths so the source stays stable regardless of CLI `workdir` or the current Markdown file.

Use `.markdown-formal/definitions.json` only for definition lookup exceptions: nonstandard prose definitions, aliases, bilingual lookup, stable multi-paragraph preview content, or cases where the automatic boundary is likely wrong. Standard definitions that naturally end by punctuation or structure can stay in the Markdown source only:

```json
[
  {
    "term": "定义域",
    "aliases": ["domain"],
    "source": "examples/book1/01-introduction.md:7",
    "content": "定义域是算子实际作用的对象范围。"
  }
]
```

`source` points to the defining sentence or paragraph. `content` is the AI-maintained Markdown excerpt used for same-file rendered lookup previews and fallback text; `verify` blocks missing or stale AI-maintained definition content.

Project-specific symbols can be declared in `.markdown-formal/symbols.json`:

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

Only record explicit local notation conventions. Symbols are exposed through the current-page navigation symbol table rather than inline formula bindings or the definition search box. The symbol table lists declarations that match LaTeX formulas in the current preview file. Do not list generic math notation or whole derivation formulas. `pattern` should describe the notation atom/family itself, with balanced delimiters; do not leave a placeholder open at the end of a formula fragment. `source`, `pattern`, and `meaning` are required; `display` is optional and normally generated from the pattern.

## AI Workflow

Give AI agents this instruction:

```text
Follow skills/editor.md.
Before writing or migrating, run npm run formal -- prepare.
Read .markdown-formal/agent-guide.md, the target Markdown file, and .markdown-formal/reference-map.md.
Reference existing numbered objects and page anchors only by copying @h-..., @h-....title, or @h-....full from reference-map.md. #h-... / #tmp-* is only for declarations; never write "命题 #h-..." or "Theorem #h-..." in prose as a reference.
Prefer page-hash refs for existing chapters/pages. @chapter:path.md and @page:path.md are compatibility refs when a page has no heading hash yet.
Keep a short natural-language cue near important refs, such as "by the spectral-radius lemma `@h-...`"; do not leave important prose as only a bare `@h-...`.
Use tmp-1/tmp-2/... for new markers; do not generate hash IDs manually.
Use the same tmp-ID rule for equations, figures, and tables: `公式 #tmp-*：`, `图 #tmp-*（Caption）：...`, `表 #tmp-*（Caption）：`.
Definitions do not get hash IDs or refs. Tool scanning handles standard `定义（Term）：...` / `Definition (Term): ...` definitions first, including common multiline ranges. When editing a file, AI only updates .markdown-formal/definitions.json for exceptions in that file: nonstandard phrases such as "called X", "we call it X", "所谓 X", "称为 X", or "记作 X", aliases/bilingual lookup, stable multi-paragraph preview content, or boundaries the heuristic may get wrong. Do not mechanically rewrite prose just to fit a marker format, and do not full-book regenerate definitions.json.
Maintain .markdown-formal/symbols.json only for explicit project-specific notation conventions, not ordinary formulas or complete equations.
After editing, run npm run formal -- finish <file-or-dir>.
Keep Markdown and LaTeX unescaped.
```

Normal edit loop:

```bash
npm run formal -- prepare
npm run formal -- finish path/to/chapter.md
```

Definition search and the current-page symbol panel are scoped to the current book by default. If one book intentionally depends on another, declare it in `.markdown-formal/config.json`:

```json
{
  "scan": {
    "exclude": [
      "formal-oet/.lake/**",
      ".context/**",
      "draft/**"
    ]
  },
  "lookup": {
    "bookDependencies": {
      "book3": ["book2"]
    }
  },
  "preview": {
    "ignoreHover": [
      "appendix-b-concepts.md",
      "concept-*.md",
      "the-operator-evolution-theory/**/appendix-*.md"
    ]
  },
  "pdf": {
    "pdfEngine": "xelatex",
    "paper": "a4",
    "margin": "2.5cm",
    "toc": true,
    "tocDepth": 2,
    "lang": "zh-CN",
    "tocTitle": "目录",
    "title": "算子演化论",
    "subtitle": "卷 I：规范空间与算子",
    "author": "",
    "date": "",
    "documentClass": "ctexbook",
    "titlePage": true,
    "tocPageBreak": true,
    "variables": []
  },
  "debug": {
    "previewLog": false,
    "markerTraceIds": []
  }
}
```

Run `npm run formal` from the project root that owns `.markdown-formal/definitions.json` and `.markdown-formal/symbols.json`. `.markdown-formal/config.json` is the explicit opt-in switch for enhanced Markdown preview; if the config or generated `preview-cache.json` is missing, the extension leaves the preview as ordinary Markdown and does not inject navigation, search, or formal reference data. Use `scan.exclude` to keep generated, context, draft, or build directories out of the formal book scan. Use `preview.ignoreHover` for concept appendices or other recall-heavy files where inline `@hash` hover previews should be skipped; numbering, navigation, jumps, definition search, and the current-page symbol panel still work. Patterns may be full relative paths, bare filenames such as `appendix-b-concepts.md`, or globs such as `concept-*.md` and `book/**/appendix-*.md`. `00-introduction.md`, `intro.md`, and `introduction.md` are treated as intro pages, not chapter 0.

Formal references across different `book*` roots are blocked by `verify` unless the source book declares the target book in `lookup.bookDependencies`. This keeps independent books from silently depending on each other while still allowing explicit dependency chains.

Set `debug.previewLog` to `true` temporarily when diagnosing blank previews, extension-host stalls, or marker rendering issues. Diagnostic events are written to `.markdown-formal/preview-debug.log`; set `debug.markerTraceIds` to specific hash IDs such as `["h-..."]` when tracing one marker's before/after token rewrite. Turn debug logging off after collecting the log.

`prepare` writes generated helper files under `.markdown-formal/`:

- `agent-guide.md`: compact AI workflow card
- `reference-map.md`: display number, page anchor, and unnumbered anchor to hash ID map
- `preview-cache.json`: runtime preview/navigation/definition/symbol table cache
- `dependency-graph.json`: canonical theorem-like dependency graph built from explicit `@h-...` references
- `dependency-report.md`: human/AI-readable dependency summary with statement/proof edges, cross-scope edges, cycles, and isolated nodes
- `report.md`: lint/verify details
- `audit.md`: advisory cleanup report generated by `npm run formal -- audit`

Do not edit generated `.markdown-formal/` files by hand. The project-maintained entries under that directory are `.markdown-formal/config.json`, `.markdown-formal/definitions.json`, and `.markdown-formal/symbols.json`; the rest are generated caches and reports.

## Exporting PDF

Formal Markdown is not meant to be compiled directly by ordinary Markdown/PDF tools because it contains stable hash declarations and `@h-...` references. Export a portable Markdown source first:

```bash
npm run formal -- export-md path/to/chapter-or-dir --out dist/book.md
npm run formal -- export-pdf path/to/chapter-or-dir --out dist/book.pdf
npm run formal -- render-pdf dist/book.md --out dist/book.pdf
```

`export-md` rewrites formal declarations and refs into ordinary Markdown text while preserving the original Markdown and LaTeX source. It also rewrites relative Markdown link/image targets to be relative to the formal root, so a multi-file export can be compiled from one generated file.

`export-md` orders directories by formal page metadata: intro pages, numbered chapters, summaries, then appendices. This avoids `summary.md` falling after appendices just because of filename sorting.

`export-pdf` runs the same Markdown export and then calls `pandoc` from `PATH` with `--pdf-engine xelatex` by default. `render-pdf` starts from an already compiled ordinary Markdown file and only calls `pandoc`; it does not scan formal source, rerun `export-md`, create `.markdown-formal/config.json`, or apply project-specific hooks. Use it when a release flow needs `export-md -> project postprocess -> render-pdf`.

PDF rendering reads defaults from `.markdown-formal/config.json` `pdf` when present. Without config, it defaults to A4 paper, a 2.5cm margin, a table of contents with depth 2, language-based TOC title (`目录` for Chinese, `Contents` for English), and a separate TOC page. Override these with `--paper`, `--margin`, `--no-toc`, `--toc-depth`, `--lang`, `--toc-title`, `--title`, `--subtitle`, `--author`, `--date`, `--documentclass`, `--title-page`, or `--no-toc-page-break`. No npm PDF dependency is bundled. Use `--pdf-engine lualatex` or another installed engine when needed, pass Pandoc variables with `-V key:value` or `--variable key:value`, and use `export-pdf --md-out dist/book.md --keep-md` if you want to inspect the intermediate Markdown.

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

`migrate-text-refs` automatically rewrites unambiguous typed numbered references, including common forms such as `定理 2.1`, `Theorem 2.1`, `公式 (2.1)`, `Figure 2.1`, `表 2.1`, `第 2.1 节`, `§2.1`, and `Sec. 2.1`. It intentionally does not rewrite bare `2.1`, bare `(2.1)`, or handwritten chapter refs such as `第 2 章` / `Chapter 2`, because those need prose context; convert chapter refs manually to a page hash `@h-...` when available, otherwise to `@chapter:path/to/chapter.md`. Matching is bounded so `2.1` is not rewritten inside `2.12`, `2.1.3`, or `22.1`. It does not rewrite old Markdown links in place because formal refs render as links already; those links are listed in `.markdown-formal/text-ref-migration.md` with suggested IDs.

The same report lists plain `##`/`###` section headings that may need numbered markers. `audit` additionally lists handwritten chapter references and suggests a page hash when the target chapter already has one, otherwise a compatibility `@chapter:` path. For referenced sections, write the heading as `## #tmp-* Title`, run `finish`, then rerun the migration.

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
npm run formal -- audit [file-or-dir]
npm run formal -- graph
npm run formal -- graph summary [--where all|statement|proof|body]
npm run formal -- graph focus <h-id> [--depth N] [--where all|statement|proof|body]
npm run formal -- graph impact <h-id> [--where all|statement|proof|body]
npm run formal -- graph upstream <h-id> [--where all|statement|proof|body]
npm run formal -- graph bridges|isolated|cycles [--where all|statement|proof|body]
npm run formal -- graph matrix chapter|volume|book [--where all|statement|proof|body]
npm run formal -- perf-dummy 50 200 --max-ms 2000 --max-heap-mb 256
npm test
```

`verify` is the strict generated/migrated-content gate. It fails on missing refs, missing page refs, duplicate IDs, remaining temporary IDs, non-hash IDs, disallowed cross-book refs, malformed equation/figure/table markers, and unresolved text-reference migration reports.

`audit` is advisory and exits successfully. It writes `.markdown-formal/audit.md` with old typed references, handwritten chapter references, old Markdown links, plain section headings that may need stable markers, suspicious bare number references, unused optional example hashes, and theorem-like blocks that do not have a visible `证明` / `Proof` boundary.

`graph` refreshes `.markdown-formal/dependency-graph.json` and `.markdown-formal/dependency-report.md`. `prepare`, `finish`, and `verify` also write these files, so `graph` is mainly for focused dependency inspection. The graph only treats `prop`/`lemma`/`theorem`/`cor` nodes as theorem dependencies; references outside theorem-like statement/proof blocks are reported as ambient diagnostics rather than dependency edges.

Use graph analysis commands when changing theorem-like content:

- `graph impact <h-id>` shows downstream theorem-like nodes that explicitly depend on a node.
- `graph upstream <h-id>` shows the upstream dependencies of a node.
- `graph focus <h-id> --depth 2` shows a local upstream/downstream neighborhood and local edges.
- `graph matrix chapter|volume|book` summarizes dependency flow between scopes.
- `graph bridges`, `graph isolated`, and `graph cycles` give structural review lists.
- `--where statement|proof|body` filters edges by where the explicit `@h-...` reference occurs.

These commands are generic graph analysis only. Domain meanings such as "foundation theorem", "bridge lemma", "Lean priority", or project-specific coupling rules belong in the target project, not in markdown-formal's canonical explicit graph.

## Local Release

The editor extension is compiled with `tsc`; the CLI and Markdown preview script are bundled by the pinned dev dependency `vite@6.4.2` into `out/cli/*.js` and `media/formal-script.js`. Runtime artifacts remain dependency-free. Build a local directory release with:

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

Check `checksums.txt` before copying release artifacts. Do not auto-install or auto-update skills from remote sources. Then use `skills/integrator.md` as an integration patch: merge the markdown-formal rules into the target project's native AI writing instructions, such as `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, an existing writing skill, or the repository README. Do not leave it as a detached extra skill if the project already has its own writing workflow.

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
