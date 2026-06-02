 Understory — Project Plan

> A monorepo containing packages for building static choose-your-own-adventure story websites.
> This document is the source of truth for an AI coding agent implementing this project.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Package Details](#package-details)
4. [Project Structure](#project-structure)
5. [Setup & Development](#setup--development)
6. [Dependencies](#dependencies)
7. [CI/CD](#cicd)
8. [AI Agent Guidelines](#ai-agent-guidelines)

---

## Overview

Understory is a system for authoring and displaying interactive fiction as static websites. Stories are written as flowchart-like files (scenes), parsed at build time into JSON, and played back in the browser with a reactive UI.

**Core principles:**
- Framework-agnostic logic. Only `@probablyduncan/understory-astro` depends on a UI framework (SolidJS).
- Parsers are pluggable. The mermaid parser is the first, but others can be added trivially.
- The runtime is testable without a browser or DOM.
- Users update the package to get new features — they don't own/maintain template code.
- TDD throughout. Every package has its own test suite.
- Accessibility, reduced motion, and screen reader support are first-class concerns.
- Debug tooling is first-class, not an afterthought.

**End-user experience:**
```
pnpm create astro --template understory
```
A user gets a minimal project: a config file and a scenes directory. All logic, components, layouts, and rendering lives in the `@probablyduncan/understory-astro` package. They write `.mmd` files, and the site renders their story. To update, they run `pnpm update @probablyduncan/understory-astro`.

**A user's project looks like:**
```
my-story/
├── src/
│   ├── scenes/
│   │   ├── intro.mmd
│   │   └── chapter-1.mmd
│   └── layouts/              ← optional: custom layouts (tsx)
│       └── title-card.tsx
├── astro.config.mjs          ← ~5 lines, uses understory() integration
├── understory.config.ts      ← optional overrides
├── custom.css                ← optional CSS overrides (custom properties)
└── package.json              ← depends on @probablyduncan/understory-astro
```

The user does NOT have pages, components, or layouts in their project by default. The integration injects all of that at build time via Astro's `injectRoute` API. When you `pnpm update @probablyduncan/understory-astro`, you get new components, layouts, features, and bug fixes without touching project files.

---

**Dependency graph:**
- `@probablyduncan/understory-astro` → `@probablyduncan/understory-runtime` → `@probablyduncan/understory-core`
- No circular dependencies. Each layer only depends downward.

**Why 3 packages, not 4:**
- The "template" and "integration" are the same thing. The user's project is minimal config + content. Everything else lives in `@probablyduncan/understory-astro`.
- The Astro integration layer is small glue code. It's not worth separating from the UI components and layouts it serves.
- If someone wants to go headless (custom UI), they use `@probablyduncan/understory-core` + `@probablyduncan/understory-runtime` directly and skip `@probablyduncan/understory-astro` entirely.
- If a React/Vue/Svelte version is ever needed, it would be a new package (`@probablyduncan/understory-react`, etc.) consuming the same core + runtime.

---

## Package Details

See each package's `README.md` for full API/type documentation.

### @probablyduncan/understory-core

**Purpose:** Pure TypeScript library for story data types and parsing.

**Key constraints:**
- No Node.js APIs (no `fs`, no `path`) — parsers receive string content, not file paths
- No DOM APIs
- Synchronous parse functions — the integration layer handles async file reading

**Testing strategy:**
- Unit tests per parser with fixture files (`.mmd` files in a `__fixtures__` directory)
- Snapshot tests for parser output (input fixture → expected Scene JSON)
- Unit tests for edge text parsing (conditions, effects, combinators, precedence, parentheses)
- Unit tests for inline markdown utility
- Tests run in Node via vitest

**Entry points:**
```
@probablyduncan/understory-core           → types + validation
@probablyduncan/understory-core/parsers   → all built-in parsers + Parser interface
```

---

### @probablyduncan/understory-runtime

**Purpose:** Framework-agnostic game engine. Manages traversal, state, save/load, config, events.

**Key constraints:**
- No DOM APIs (no `document`, no `window`, no `localStorage` directly — always uses `StorageAdapter`)
- No framework imports (no Solid, no React, nothing)
- Depends only on `@probablyduncan/understory-core`
- `resolveNext` / `StoryTraverser` must be pure and synchronous
- Config and save state use separate storage keys and separate stores
- Display mode logic does NOT live here — the engine emits events, the UI decides how to display them

**`StorageAdapter` synchronicity:** Intentionally synchronous. Covers `localStorage` (default) and in-memory storage (for testing) without requiring Promise handling in the traversal loop.

**Fast-forward replay:** When loading a save into a post-`clear` state, the engine replays `choicesSinceClear` in silent mode (no `render` events) to reconstruct the current dialogue without re-displaying it.

**Testing strategy:**
- Unit tests for `resolveNext` / `StoryTraverser` (given scene + state → expected traversal result)
- Unit tests for `GameState` (condition evaluation with all operators, effect application, serialization round-trip)
- Unit tests for `ConfigStore` (defaults, partial updates, persistence, subscribe/notify)
- Unit tests for `SaveManager` (versioning, migration between versions)
- Integration tests for `StoryEngine` (full traversal sequences using `MemoryStorageAdapter` and mock scene loader)
- All tests run in Node via vitest, no browser needed

---

### @probablyduncan/understory-astro

**Purpose:** The complete Astro package: integration + UI rendering + themes + debug tools. This is what end users install.

**How it works (the Starlight model):**

The package exports an `understory()` function that returns an Astro integration. When the user adds it to their `astro.config.mjs`, the integration:
1. Registers a content loader that watches `.mmd` files, parses them using `@probablyduncan/understory-core`, and validates output
2. Injects routes via Astro's `injectRoute()` API — the user's project has no pages
3. Generates static JSON endpoints for each scene
4. Injects client scripts (runtime + Solid rendering)
5. Applies base styles and user's custom CSS
6. Provides a layout system (built-in + user-defined) for per-scene presentation and transitions

**Integration responsibilities:**
- `understory()` — Astro integration function
- `defineStoryConfig()` — typed config helper, exported from the `./config` subpath
- Content loader: watches for `.mmd` files, calls parser, runs validation, logs errors without crashing dev server, re-parses only changed files on watch
- Route injection:
  - `GET /api/scenes/[id].json` — static endpoint per scene (prerendered at build)
  - `GET /` — main story page
  - `GET /debug` — only injected when **both** `config.debug === true` **and** `import.meta.env.DEV === true`
- Provides virtual module `virtual:understory/config` for accessing resolved config in client code

**Layout system:**
- Layouts are SolidJS components owning their own transitions
- Layout components coordinate when the engine begins rendering (after entry transition) and stops (before exit transition)
- Unknown layout names surface as build-time errors; unknown names at runtime fall back to the default layout
- User layouts can be registered explicitly in `understory.config.ts` or auto-loaded from `src/layouts/*.tsx`

**CSS architecture:**
- All package styles wrapped in `@layer understory` — user overrides always win without `!important`
- Custom properties prefixed `--us-`; component classes prefixed `st-`
- Prebuilt themes (`terminal`, `paper`, `minimal`) applied via `[data-theme]` on `<html>`
- Reduced motion: `--us-timing-*` zeroed via media query and programmatically when `config.reduceMotion` is true

**Build note:** `tsc` compiles `index.ts`, `config.ts`, `loader.ts`, and `endpoints.ts`. The `.astro` pages and `.tsx` components remain as source files and are processed by Astro at the user's build time when resolving injected routes from `node_modules`.

**Testing strategy:**
- Unit tests for loader logic (mock filesystem, verify correct parser is called, verify validation runs)
- Integration tests: minimal Astro project in `__fixtures__/` that builds successfully and produces expected JSON output
- E2E tests with Playwright:
  - Navigate scenes, make choices, verify correct text appears
  - Save/load persistence across page reload
  - Keyboard navigation (number keys for choices, space to skip, enter to continue)
  - Display mode switching
  - Theme switching
  - Reduced motion behavior
- Accessibility audits with axe-core in Playwright tests

---

### Development Workflow

```bash
# Install all dependencies
pnpm install

# Build all packages (respects dependency order: core → runtime → astro)
pnpm build

# Run all unit tests
pnpm test

# Run E2E tests
pnpm test:e2e

# Watch tests for a specific package
pnpm --filter @probablyduncan/understory-core test:watch

# Dev mode: run the example project with hot reload
cd examples/basic-story && pnpm dev

# Run a specific test file
pnpm --filter @probablyduncan/understory-core vitest run __tests__/mermaid-parser.test.ts
```

---

## AI Agent Guidelines

### Package boundaries — the single most important rule:

| If you're writing code that... | It belongs in... |
|---|---|
| Defines types, schemas, or validation | `@probablyduncan/understory-core` |
| Parses a file format into a `Scene` | `@probablyduncan/understory-core` |
| Manages game state, traversal, save/load | `@probablyduncan/understory-runtime` |
| Emits or subscribes to engine events | `@probablyduncan/understory-runtime` |
| Manages user config (speed, theme, etc.) | `@probablyduncan/understory-runtime` |
| Reads files from disk | `@probablyduncan/understory-astro` |
| Uses Astro APIs (`injectRoute`, content loader) | `@probablyduncan/understory-astro` |
| Renders UI with SolidJS (including layouts) | `@probablyduncan/understory-astro` |
| Applies CSS / manages themes | `@probablyduncan/understory-astro` |
| Uses DOM APIs (`document`, `window`) | `@probablyduncan/understory-astro` |

### Dependency direction is strictly enforced:

```
core ← runtime ← astro
```

- `core` imports NOTHING from the monorepo.
- `runtime` imports ONLY from `core`.
- `astro` imports from `core` and `runtime`.
- NEVER import upward. If `runtime` needs something from `astro`, the design is wrong.

### Code style rules:

1. **Write tests first or alongside code.** Every exported function in `core` and `runtime` must have corresponding tests. No exceptions.

2. **Keep parsers pure.** A parser receives a `string` and returns a `Scene`. No file reading, no side effects, no async, no DOM. Asset resolution is passed in via options.

3. **`resolveNext` (the traverser) must be pure.** Given `(children, scene, gameState, sceneId)` → returns `TraversalResult`. No mutations, no async, no side effects. The `StoryEngine` wraps it with side effects.

4. **UI code never contains game logic.** UI calls `engine.choose()`, `engine.goToNode()`, etc. UI does NOT evaluate state conditions, traverse nodes, or mutate game state directly. UI only reads signals/state and renders.

5. **Config vs save state are separate concerns.** Different storage keys. Different stores. Config survives `engine.reset()`.

6. **Display mode logic lives in the UI layer.** The engine emits events ("here's a node"). The UI decides whether to auto-advance or wait for user input based on config. The engine does not know about display modes.

7. **Layouts own transitions.** Layout components are responsible for coordinating when the engine begins rendering (after entry transitions) and when it stops rendering (before exit transitions). Keep transition and layout concerns out of `@probablyduncan/understory-runtime`.

8. **Use workspace protocol for internal deps.** Always `"@probablyduncan/understory-core": "workspace:*"`, never a pinned version.

9. **CSS classes are prefixed `st-`.** All component styles use custom properties from the `understory` cascade layer.

10. **Commit messages use conventional commits.** Format: `feat(core): add mermaid parser`, `fix(runtime): handle empty scene path`, `test(astro): add E2E for save/load`.

11. **Error handling:** Parsers return `ParseResult` with `StoryIssue[]` — they never throw on bad content. The integration reads issues and logs without crashing. The engine emits `error` events — never throws in async traversal.

### Package build order:
```
core → runtime → astro
```

Turborepo handles this automatically via `dependsOn: ["^build"]`. If making changes across packages manually, always build in this order.

### Testing commands:
```bash
# All tests
pnpm test

# Single package
pnpm --filter @probablyduncan/understory-core test

# Single file
pnpm --filter @probablyduncan/understory-core vitest run __tests__/mermaid-parser.test.ts

# Watch mode
pnpm --filter @probablyduncan/understory-runtime test:watch

# E2E
pnpm test:e2e

# E2E single file
pnpm --filter @probablyduncan/understory-astro -- playwright test e2e/navigation.spec.ts
```

### Implementation order for v1:

1. **@probablyduncan/understory-core** — types → schemas → inline markdown util → smart quotes → mermaid tokenizer → edge text parser → node builder → mermaid parser → validation
2. **@probablyduncan/understory-runtime** — event bus → game state → traverser → config store → save manager → engine
3. **@probablyduncan/understory-astro** — integration entry + config helper → content loader → JSON endpoints → route injection → layout system → Solid bindings → rendering → styles/themes
4. **examples/basic-story** — validate everything works end-to-end
5. **CI/CD** — GitHub Actions workflows, changeset config

Within each package, implement in order of testability: pure functions first, then stateful classes, then side-effectful code, then UI last.
