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

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  @probablyduncan/understory-core                                │
│  - Types/schemas (StoryNode, Scene, etc.)                       │
│  - Parser interface                                             │
│  - Built-in parsers (mermaid v1)                                │
│  - Story validation utilities                                   │
│  - Pure TypeScript, zero framework deps                         │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────┼───────────────────────────────────────┐
│  @probablyduncan/understory-runtime                             │
│  - Story traversal (pure, sync)                                 │
│  - Game state management                                        │
│  - Save/load (pluggable storage adapter)                        │
│  - Client config store (display mode, speed, theme, etc.)       │
│  - Event emitter                                                │
│  - Pure TypeScript, zero framework deps, no DOM                 │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────┼───────────────────────────────────────┐
│  @probablyduncan/understory-astro                               │
│  - Astro integration (content loader, route injection)          │
│  - Static JSON endpoint generation for scenes                   │
│  - Config helper (defineStoryConfig)                            │
│  - Layout system (built-in + user-provided)                     │
│  - SolidJS UI rendering                                         │
│  - CSS themes via custom properties + cascade layers            │
│  - Text animation (typewriter, etc.)                            │
│  - Debug tools                                                  │
└─────────────────────────────────────────────────────────────────┘
```

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

### Mermaid Parser v1

See `packages/core/src/parsers/mermaid-flowchart/README.md` for full syntax reference.

**Why a custom parser:** `@mermaid-js/parser` does not support flowcharts. The legacy `mermaid` package requires a DOM and DOMPurify. The flowchart subset we use is small enough for a custom line-by-line parser (~300 lines), eliminating a 2.5MB+ dependency and making the parser synchronous and trivially testable.

**Key behaviors:**
- Edge stroke → delay style: normal `-->` = `"dots"`, thick `==>` = `"pause"`, dotted `-.->` = `"fade"`, invisible `~~~` = no delay
- Edge length → delay beats: `beats = dash_count - 1`
- Variable names without `:` are prefixed with scene ID to prevent cross-scene collisions
- Effects on edges to `ChoiceNode` targets go on `onChoose`; all other edge effects go on `ChildRef.effects`
- `!` alone on an edge = "once" shorthand: adds a `visited:<sceneId>:<targetId>` falsy condition and sets `repeat: "once"` on the target

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

### Adding a New Parser

1. Create `packages/core/src/parsers/myformat/index.ts`
2. Implement the `Parser` interface (must be synchronous, receive string, return `Scene`)
3. Add fixture files in `packages/core/__fixtures__/myformat/`
4. Add expected output in `packages/core/__fixtures__/expected/myformat/`
5. Add tests in `packages/core/__tests__/myformat-parser.test.ts`
6. Export from `packages/core/src/parsers/index.ts`
7. Add subpath export in core's `package.json`

### Adding a Custom Layout

1. Create a Solid layout component in the user's project (recommended: `src/layouts/<name>.tsx`)
2. Register it in `understory.config.ts` via `StoryConfig.layouts` (preferred)
3. Reference it from a scene using `%% layout: <name>` at the top of the `.mmd` file
4. Layout handles its own transitions and controls when to begin/end engine rendering

### Adding a Custom Node Handler

1. Add the handler function in `packages/astro/src/engine/customNodes.ts`
2. Register the name in the exported registry
3. Reference by name in `.mmd` files (vertex text matches the registered name)
4. The handler receives engine state and can trigger visual effects, sounds, etc.

---

## Dependencies

### @probablyduncan/understory-core
| Dependency | Type | Purpose |
|---|---|---|
| `vitest` | dev | Testing |
| `typescript` | dev | Build |

### @probablyduncan/understory-runtime
| Dependency | Type | Purpose |
|---|---|---|
| `@probablyduncan/understory-core` | runtime (workspace) | Types, schemas |
| `vitest` | dev | Testing |
| `typescript` | dev | Build |

### @probablyduncan/understory-astro
| Dependency | Type | Purpose |
|---|---|---|
| `@probablyduncan/understory-core` | runtime (workspace) | Parsers, types, validation |
| `@probablyduncan/understory-runtime` | runtime (workspace) | Engine, config store |
| `solid-js` | runtime | UI reactivity + layouts |
| `astro` | peer | Framework (user provides) |
| `@astrojs/solid-js` | peer | Solid integration for Astro (user provides) |
| `vitest` | dev | Unit testing |
| `@playwright/test` | dev | E2E testing |
| `typescript` | dev | Build |

### Root / Tooling
| Dependency | Type | Purpose |
|---|---|---|
| `turbo` | dev | Monorepo task orchestration + caching |
| `@changesets/cli` | dev | Version management + changelogs |
| `typescript` | dev | Shared compiler |
| `vitest` | dev | Shared test runner |

### NOT included (and why)
| Package | Reason excluded |
|---|---|
| `mermaid` | Too heavy (2.5MB), requires DOM. We write our own flowchart subset parser. |
| `dompurify` | Only needed because of mermaid. Eliminated. |
| `marked` | We only need inline markdown (bold/italic/code/links). A ~50-line utility suffices. |
| `gsap` | Nice-to-have for v2 animation. V1 uses CSS transitions + requestAnimationFrame. |
| `react` / `vue` / `svelte` | SolidJS chosen for fine-grained reactivity + small bundle. |

---

## CI/CD

### Repository

GitHub repository. Public. Main branch protected:
- Require PR for all changes to `main`
- Require CI to pass before merge
- Require at least 1 approval (optional for solo dev, enable later)

### GitHub Actions: CI (`.github/workflows/ci.yml`)

**Triggers:** Push to `main`, all pull requests.

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm test

  e2e:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: npx playwright install --with-deps
      - run: pnpm test:e2e
```

### GitHub Actions: Release (`.github/workflows/release.yml`)

**Triggers:** Push to `main` (after PR merge).

```yaml
name: Release

on:
  push:
    branches: [main]

permissions:
  contents: write
  pull-requests: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
          registry-url: "https://registry.npmjs.org"
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm test
      - uses: changesets/action@v1
        with:
          publish: pnpm release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### Changeset Workflow

```bash
# After making changes to any package, describe the change:
pnpm changeset

# This prompts:
# 1. Which packages changed?
# 2. Major/minor/patch for each?
# 3. Summary of the change?
# Creates a markdown file in .changeset/ — commit it with your PR.
```

**Changeset config (`.changeset/config.json`):**
```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.0.0/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [
    ["@probablyduncan/understory-core", "@probablyduncan/understory-runtime", "@probablyduncan/understory-astro"]
  ],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch"
}
```

`linked` means: when any one package in the group is released, all are released together at the same version.

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

11. **Error handling:** Parsers throw `ParseError` with line numbers. The integration catches and logs without crashing. The engine emits `error` events — never throws in async traversal.

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
