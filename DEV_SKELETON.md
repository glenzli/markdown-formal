# Dev Skeleton

## Purpose

- Support long-form mathematical and technical Markdown writing with stable source IDs, generated reader-facing numbering, reference checks, enhanced preview, and publication exports.
- Make AI-assisted editing safer by letting agents draft with temporary markers while deterministic tooling finalizes IDs and verifies generated state.
- Keep the extension and CLI usable as local, reviewable tooling that can be vendored into writing projects.

## Non-Goals

- General-purpose Markdown rendering outside the formal-writing workflow.
- Cloud services, remote indexing, telemetry, or hidden state.
- A theorem prover or mathematical correctness checker.
- A persistent AI implementation KB, source index, or call-graph mirror.
- Automatic skill installation, remote skill updates, or target-project policy ownership.

## Source Of Truth

- `src/**`: implementation source for the extension, CLI, scanner, export, and release tooling.
- `tests/formal-tools.test.mjs`: regression coverage for formal syntax, migration, export, graph, and audit behavior.
- `examples/**`: fixtures and sample writing projects used to exercise behavior.
- `docs/usage.md`, `docs/ai-integration.md`, `docs/release.md`: maintained public documentation.
- `skills/editor.md`, `skills/integrator.md`: reviewed target-project AI integration material.
- `package.json`, `.vscodeignore`, `tsconfig*.json`, `vite.*.ts`: build, packaging, and extension boundary configuration.
- Generated outputs under `out/`, `dist/`, and `.markdown-formal/` are verification artifacts, not durable development guidance.

## Stable Constraints

- Source Markdown should stay readable to humans and AI; generated numbering must not require broad manual rewrite.
- Formal IDs are stable implementation data; reader-facing numbers are rendered or exported from metadata.
- Definitions and symbols are lookup aids, not theorem-numbering objects.
- Preview enhancements are opt-in for workspaces with `.markdown-formal/config.json`; ordinary Markdown preview should stay ordinary elsewhere.
- Release bundles ship runtime artifacts, public docs, and target-project skills only; repository development skeletons are source-checkout context.
- Built extension and CLI runtimes should remain dependency-free after bundling.
- Dependency changes require caution and explicit verification because supply-chain risk matters for editor tooling.
- Entry hints should stay at file or artifact-category level, not function level.

## Domain Assumptions

- Mathematical writing changes structure often; stable references matter more than preserving handwritten numbers.
- AI agents can read the current source for implementation facts. Durable guidance should describe boundaries and review preferences, not current control flow.
- Target projects may already have their own writing instructions; markdown-formal rules should be merged into those native instructions instead of layered blindly.

## Entry Hints

- Public usage or target-project integration: start with `README.md`, `docs/usage.md`, `docs/ai-integration.md`, and `skills/integrator.md`.
- Writing-rule details: start with `skills/editor.md`.
- CLI or syntax behavior changes: start with `src/cli/formal-tools.ts`, `src/core/formal-core.ts`, and `tests/formal-tools.test.mjs`.
- Preview behavior changes: start with the markdown extension entrypoints, preview script, styles, and the relevant tests or examples.
- Release boundary changes: start with `src/cli/release.ts`, `.vscodeignore`, `docs/release.md`, and `npm run release:local`.

## Refresh Triggers

Update this file only when project purpose, non-goals, source-of-truth categories, stable constraints, release boundaries, dependency posture, or common entry hints change. Routine implementation changes should not update it.

## Boundary

This skeleton is orientation only. Verify facts against source, tests, config, generated release artifacts, and maintained public docs.
