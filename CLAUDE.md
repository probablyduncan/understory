# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Understory is a monorepo for building static choose-your-own-adventure story websites. Stories can be written in various formats (currently only Mermaid flowchart files (`.mmd`) are supported), parsed at build time into JSON `Scene` objects, and played back in the browser via a reactive SolidJS UI.

**PLAN.md is a first-pass source of truth document** for architecture, package responsibilities, and implementation order. It is not perfect. Read it before making structural decisions, but if there is drift between current code and PLAN.md, it may be because PLAN.md is outdated. There are also several README.md's in this repository, which are used for more specific directory-level information. If you identify and discrepancies or drift between documentation and existing code, ask about it before assuming one or the other is correct.

## Commands

```bash
pnpm install                        # install all dependencies
pnpm build                          # build all packages (core → runtime → astro)
pnpm test                           # run all unit tests
pnpm test:e2e                       # run Playwright E2E tests

# Single package
pnpm --filter @probablyduncan/understory-core test
pnpm --filter @probablyduncan/understory-runtime test:watch

# Single test file
pnpm --filter @probablyduncan/understory-core vitest run parsers/mermaid-flowchart/mermaid-parser.test.ts

# E2E single file
pnpm --filter @probablyduncan/understory-astro -- playwright test e2e/navigation.spec.ts

# Run example project
pnpm example   # builds packages then starts basic-story dev server
```

## Package Architecture

Strict one-way dependency chain — never import upward:

```
core ← runtime ← astro
```

| Package | Purpose |
|---|---|
| `@probablyduncan/understory-core` | Types, schemas, parsers — no Node/DOM APIs, synchronous only |
| `@probablyduncan/understory-runtime` | Game engine, state, traversal, save/load — no DOM, no framework |
| `@probablyduncan/understory-astro` | Astro integration + SolidJS UI + themes. What end users install. |

`core` exports two entry points: `.` (types + validation) and `./parsers` (parsers + `Parser` interface).

## Key Design Rules

**Parsers are pure.** `parseScene(id, content, options?)` → `ParseResult`. No file I/O, no async, no side effects. Never throws on bad content — returns `StoryIssue[]` instead.

**`resolveNext` is pure.** Given `(children, scene, gameState, sceneId)` → `TraversalResult`. No mutations, no async. `StoryEngine` wraps it with side effects.

**UI calls engine methods only.** UI never evaluates state conditions, traverses nodes, or mutates `GameState` directly.

**Config and save state are separate.** Different storage keys, different stores. Config survives `engine.reset()`.

**Display mode logic lives in the UI layer.** The engine emits `render` events; the UI decides whether to auto-advance.

**Layouts and other UI components own transitions.** `StoryEngine` knows nothing about transitions.

## Mermaid Parser

The mermaid parser (`packages/core/src/parsers/mermaid-flowchart/`) is a custom line-by-line parser (does not use the `mermaid` npm package). Read its `README.md` for the full syntax spec, including:
- Vertex shape → node type mapping
- Reserved keywords (`begin`, `clear`, `return`, `reset`)
- Edge stroke → delay mapping (`-->`, `==>`, `-.->`  , `~~~`)
- Edge text mini-language for conditions and effects (`hasKey`, `+gold`, `level > 5`)
- Scene references: `[[chapter1.mmd]]` in a `.mmd` file creates a `SceneNode` with `sceneId: "chapter1"` (extension stripped). Any vertex shape works; bare names without extension are not resolved as scene references.

`stateExpression.ts` (sibling of the mermaid directory) is shared parsing logic for edge text — used by any parser, not just mermaid.

## CSS Conventions

- All styles in `@layer understory` — user overrides always win
- Custom properties: `--us-` prefix
- Component classes: `us-` prefix

## Docs

When implementing a feature or updating logic, make sure to update PLAN.md or relevant README's as well. Never increase the level of detail in documentation - if the document does not contain code snippets, do not add code snippets, for example. If the document doesn't go in-depth on specific functions, don't add function-level information. Just ensure that the documentation is up-to-date. If you notice a discrepancy, ambiguity, or error in any of these documents, ask about it before assuming the docs or code are correct.