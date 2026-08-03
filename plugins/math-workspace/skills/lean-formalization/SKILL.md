---
name: lean-formalization
description: Anchor, implement, review, or reorganize Lean 4 formalizations for a project prepared with Math Workspace. Use when Lean declarations must correspond to stable Markdown formal objects, when checking anchor coverage, or when validating Lean/source alignment without overstating proof coverage.
---

# Lean Formalization

Use Math Workspace stable IDs as the correspondence layer between mathematical source and Lean declarations. Treat a detected Lean anchor as evidence of a maintained link, not as a claim that the source object is completely formalized or that its prose and Lean statement are semantically identical.

## Establish the source contract

1. Run `math-workspace prepare` or the project wrapper before editing.
2. Read `.math-workspace/config.json`, `.math-workspace/agent-guide.md`, `.math-workspace/lean-index.json`, `.math-workspace/lean-report.md`, and the exact source object being formalized.
3. Resolve objects by stable `h-*` ID. Never bind Lean names, files, or docstrings to generated display numbers.
4. Read and obey the target project's own mathematical and Lean instructions. They may impose stricter assumptions, naming, build, or coverage rules than this generic skill.

If the source statement and the existing Lean declaration disagree in assumptions, scope, quantifiers, or conclusion, report the mismatch before changing either side. Do not silently strengthen or weaken the mathematical source to simplify Lean.

## Write maintainable Lean anchors

- Put the configured anchor prefix and stable ID in a `/-- ... -/` docstring immediately before the named Lean declaration.
- Keep the source title or a precise semantic description in the docstring so humans can audit the link.
- Allow several declarations to share one source anchor when they genuinely implement separate parts of the same source object. Do not create duplicate anchors merely to inflate coverage.
- Use semantic Lean names and concept-oriented files. Avoid generated display numbers in identifiers and filenames.
- Use `snake_case` for value-level declarations and `UpperCamelCase` for structures, classes, inductive types, named predicates, and other type-level declarations.
- Prove consequences from their actual inputs. Do not hide a target conclusion in a generic certificate field and return it unchanged.
- Isolate genuinely external background theorems behind specifically named certificate interfaces, and document that boundary.

## Validate incrementally

1. Run the smallest Lean check that covers the changed file or module.
2. Expand to the configured project target when imports, shared definitions, or entry modules change.
3. Run `math-workspace lean verify` after changing anchors. Resolve unknown IDs, unreadable source roots, and anchors without a supported declaration.
4. Inspect `.math-workspace/lean-report.md` for eligible source objects that do not yet have anchors. Treat this as a review queue, not proof that each listed object must be formalized immediately.
5. Before claiming a milestone complete, run the target project's full Lean build and its project-specific placeholder or naming scans.

`math-workspace lean scan` rebuilds the deterministic index. `math-workspace lean coverage` prints the current anchor report. Neither command proves semantic equivalence, completeness, or successful compilation.

## Keep dependency claims separate

The first Lean integration indexes explicit anchors only. Do not infer Lean dependency equivalence from co-occurrence, filenames, declaration order, or source display numbers. When a project later provides a deterministic Lean dependency projection, compare it with explicit source dependencies and report mismatches as review candidates; do not automatically decide which side is wrong.
