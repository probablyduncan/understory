# Storytime — Project Plan v1

> A monorepo containing packages for building static choose-your-own-adventure story websites.
> This document is the source of truth for an AI coding agent implementing this project.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Schema](#schema)
4. [Package Details](#package-details)
5. [Mermaid Parser v1](#mermaid-parser-v1)
6. [Client Config](#client-config)
7. [Display Modes](#display-modes)
8. [CSS & Theming](#css--theming)
9. [Project Structure](#project-structure)
10. [Setup & Development](#setup--development)
11. [Dependencies](#dependencies)
12. [CI/CD](#cicd)
13. [AI Agent Guidelines](#ai-agent-guidelines)

---

## Overview

Storytime is a system for authoring and displaying interactive fiction as static websites. Stories are written as flowchart-like files (scenes), parsed at build time into JSON, and played back in the browser with a reactive UI.

**Core principles:**
- Framework-agnostic logic. Only `@storytime/astro` depends on a UI framework (SolidJS).
- Parsers are pluggable. The mermaid parser is the first, but others can be added trivially.
- The runtime is testable without a browser or DOM.
- Users update the package to get new features — they don't own/maintain template code.
- TDD throughout. Every package has its own test suite.
- Accessibility, reduced motion, and screen reader support are first-class concerns.
- Debug tooling is first-class, not an afterthought.

**End-user experience:**
```
pnpm create astro --template storytime
```
A user gets a minimal project: a config file and a scenes directory. All logic, components, and rendering lives in the `@storytime/astro` package. They write `.mmd` files, and the site renders their story. To update, they run `pnpm update @storytime/astro`.

**A user's project looks like:**
```
my-story/
├── src/
│   └── scenes/
│       ├── intro.mmd
│       └── chapter-1.mmd
├── astro.config.mjs        ← ~5 lines, uses storytime() integration
├── storytime.config.ts     ← optional overrides
├── custom.css              ← optional CSS overrides (custom properties)
└── package.json            ← depends on @storytime/astro
```

The user does NOT have pages, components, or layouts in their project. The integration injects all of that at build time via Astro's `injectRoute` API. When you `pnpm update @storytime/astro`, you get new components, features, and bug fixes without touching project files.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  @storytime/core                                                │
│  - Types/schemas (StoryNode, Scene, etc.)                       │
│  - Parser interface                                             │
│  - Built-in parsers (mermaid v1)                                │
│  - Story validation utilities                                   │
│  - Pure TypeScript, zero framework deps                         │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────┼───────────────────────────────────────┐
│  @storytime/runtime                                             │
│  - Story traversal (pure, sync)                                 │
│  - Game state management                                        │
│  - Save/load (pluggable storage adapter)                        │
│  - Client config store (display mode, speed, theme, etc.)       │
│  - Event emitter                                                │
│  - Pure TypeScript, zero framework deps, no DOM                 │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────┼───────────────────────────────────────┐
│  @storytime/astro                                               │
│  - Astro integration (content loader, route injection)          │
│  - Static JSON endpoint generation for scenes                   │
│  - Config helper (defineStoryConfig)                            │
│  - SolidJS UI components (dialogue, choices, debug panel)       │
│  - Solid bindings for runtime engine + config                   │
│  - CSS themes via custom properties + cascade layers            │
│  - Text animation (typewriter, etc.)                            │
│  - Debug tools                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Dependency graph:**
- `@storytime/astro` → `@storytime/runtime` → `@storytime/core`
- No circular dependencies. Each layer only depends downward.

**Why 3 packages, not 4:**
- The "template" and "integration" are the same thing. The user's project is minimal config + content. Everything else lives in `@storytime/astro`.
- The Astro integration layer is small glue code. It's not worth separating from the UI components it serves.
- If someone wants to go headless (custom UI), they use `@storytime/core` + `@storytime/runtime` directly and skip `@storytime/astro` entirely.
- If a React/Vue/Svelte version is ever needed, it would be a new package (`@storytime/react`, etc.) consuming the same core + runtime.

---

## Schema

These types are the contract between all packages. They live in `@storytime/core`.

### Scene

```typescript
type Scene = {
    id: string;
    nodes: Record<string, StoryNode>;
    entryNodeId: string;
    vars: string[];
    meta?: {
        source?: string;
        title?: string;
    };
};
```

### Story Nodes

```typescript
type StoryNode =
    | TextNode
    | ChoiceNode
    | ImageNode
    | SceneNode
    | CustomNode
    | GateNode
    | ClearNode;

type NodeBase = {
    id: string;
    children: ChildRef[];
};

type TextNode = NodeBase & {
    type: "text";
    html: string;
    style?: string;  // e.g. "default", "emphasis", "whisper", "narrator"
};

type ChoiceNode = NodeBase & {
    type: "choice";
    html: string;
    label?: string;
    style?: string;
    clear?: boolean;
    repeat?: "always" | "fade" | "once";
    onChoose?: StateEffect[];
};

type ImageNode = NodeBase & {
    type: "image";
    src: string;
    alt: string;
    style?: string;
};

type SceneNode = NodeBase & {
    type: "scene";
    sceneId: string;
};

type CustomNode = NodeBase & {
    type: "custom";
    name: string;
    params?: Record<string, unknown>;
};

type GateNode = NodeBase & {
    type: "gate";
    strategy?: "first" | "random";
};

type ClearNode = NodeBase & {
    type: "clear";
};
```

### Edges (ChildRef)

```typescript
type ChildRef = {
    nodeId: string;
    delay?: Delay;
    condition?: StateCondition;
    effects?: StateEffect[];
};

type Delay = {
    beats: number;
    style?: "dots" | "pause" | "fade" | string;
};
```

### State System

State variables can hold three value types:

```typescript
type StateValue = boolean | string | number;
```

A variable that hasn't been set is `undefined` (not in the state map). This is distinct from `false` — `hasKey` being undefined means "never encountered," while `hasKey` being `false` means "explicitly set to false."

**Conditions (checking state):**

```typescript
type StateCondition =
    | { type: "check"; name: string; op: "truthy" | "falsy" }
    | { type: "compare"; name: string; op: "==" | "!=" | ">" | "<" | ">=" | "<="; value: StateValue }
    | { type: "and"; conditions: StateCondition[] }
    | { type: "or"; conditions: StateCondition[] };
```

**Effects (mutating state):**

```typescript
type StateEffect =
    | { type: "set"; name: string; value: StateValue }
    | { type: "unset"; name: string }
    | { type: "increment"; name: string; by: number }
    | { type: "toggle"; name: string };
```

### Runtime Types (in @storytime/runtime, not core)

```typescript
type NodePosition = {
    sceneId: string;
    nodeId: string;
};

type ResolvedChoice = ChoiceNode & ChildRef & NodePosition & {
    visited: boolean;
    enabled: boolean;
};

type TraversalResult =
    | { type: "render"; node: StoryNode & ChildRef & NodePosition }
    | { type: "choices"; choices: ResolvedChoice[] }
    | { type: "end" }
    | { type: "exit-scene"; returnTo: NodePosition };

interface StorageAdapter {
    get(key: string): string | null;
    set(key: string, value: string): void;
    remove(key: string): void;
}
```

---

## Package Details

### @storytime/core

**Purpose:** Pure TypeScript library for story data types and parsing.

**Exports:**
- All types listed in the Schema section above
- Zod schemas matching those types (for runtime validation of parsed output)
- `Parser` interface
- Built-in parsers (mermaid v1)
- `validateScene(scene: Scene): ValidationResult` — checks for dead ends, missing node references, unreachable nodes, undefined vars
- `validateStory(scenes: Scene[]): ValidationResult` — cross-scene validation (missing scene references, orphan scenes)

**Parser interface:**
```typescript
interface Parser {
    extensions: string[];
    parse(content: string, id: string, options?: ParserOptions): Scene;
}

type ParserOptions = {
    assets?: Map<string, "image" | "custom">;
    customNodes?: string[];
    smartQuotes?: boolean;
};
```

**Key constraints:**
- Dependencies: `zod` only. Inline markdown parsing is implemented within this package (a small utility, not an external dependency — the subset needed is just bold, italic, code, and links).
- No Node.js APIs (no `fs`, no `path`) — parsers receive string content, not file paths
- No DOM APIs
- Synchronous parse functions — the integration layer handles async file reading
- Uses `zod` directly, NOT `astro/zod`

**Testing strategy:**
- Unit tests per parser with fixture files (`.mmd` files in a `__fixtures__` directory)
- Unit tests for validation utilities
- Snapshot tests for parser output (input fixture → expected Scene JSON)
- Unit tests for edge text parsing (conditions, effects, combinators, parentheses)
- Unit tests for inline markdown utility
- Tests run in Node via vitest

**Entry points:**
```
@storytime/core           → types + validation + schemas
@storytime/core/parsers   → all built-in parsers + Parser interface
@storytime/core/mermaid   → mermaid parser specifically
```

---

### @storytime/runtime

**Purpose:** Framework-agnostic game engine. Manages traversal, state, save/load, config, events.

**Exports:**
- `createEngine(config: EngineConfig): StoryEngine`
- `createConfigStore(storage: StorageAdapter, defaults?: Partial<UserConfig>): ConfigStore`
- Runtime types (`NodePosition`, `ResolvedChoice`, `TraversalResult`, etc.)
- `StorageAdapter` interface
- `LocalStorageAdapter` — default browser adapter
- `MemoryStorageAdapter` — for testing
- `resolveNext(children, scene, state): TraversalResult` — the pure traversal function, exported for testing and advanced use

**StoryEngine API:**
```typescript
interface StoryEngine {
    // Lifecycle
    init(): Promise<void>;
    destroy(): void;

    // Scene loading
    registerSceneLoader(loader: (id: string) => Promise<Scene>): void;

    // Traversal
    start(sceneId?: string): Promise<void>;
    choose(choice: ResolvedChoice): Promise<void>;
    goToNode(position: NodePosition): Promise<void>;

    // State
    getState(): GameState;
    isConditionMet(condition: StateCondition): boolean;
    getVar(name: string): StateValue | undefined;
    setVar(name: string, value: StateValue): void;
    unsetVar(name: string): void;

    // Save/Load
    save(slot?: string): void;
    load(slot?: string): boolean;  // returns false if no save found
    listSaves(): string[];
    reset(): void;

    // Events
    on<K extends keyof EngineEvents>(event: K, handler: EngineEvents[K]): () => void;
    off<K extends keyof EngineEvents>(event: K, handler: EngineEvents[K]): void;
}

type EngineEvents = {
    render: (node: StoryNode & ChildRef & NodePosition) => void;
    choices: (choices: ResolvedChoice[]) => void;
    clear: () => void;
    enterScene: (scene: Scene) => void;
    exitScene: (returnTo: NodePosition) => void;
    stateChanged: (state: GameState) => void;
    end: () => void;
    error: (error: Error) => void;
};
```

**ConfigStore API:**
```typescript
interface ConfigStore {
    get(): UserConfig;
    set(partial: Partial<UserConfig>): void;
    reset(): void;
    subscribe(handler: (config: UserConfig) => void): () => void;
}

type UserConfig = {
    displayMode: "stream" | "paged" | "instant";
    textSpeed: number;        // multiplier: 0.5 = slow, 1 = default, 2 = fast, 0 = instant
    theme: "light" | "dark" | "system";
    reduceMotion: boolean;    // auto-detected from prefers-reduced-motion, user-overridable
    fontSize: "sm" | "md" | "lg";
};
```

**Internal architecture:**
- `StoryTraverser` — pure function: given (children, scene, gameState) → returns `TraversalResult`. No side effects. Exported as `resolveNext` for direct testing and advanced use.
- `GameState` — manages state variables (Map<string, StateValue>), visited choices, scene path stack, choice history. Fully serializable.
- `SaveManager` — handles serialization/deserialization, version field, migration functions.
- `ConfigStore` — user preferences, separate lifecycle from game state, persists across resets.
- `EventBus` — typed event emitter with `on`/`off`/`once` support.

**State evaluation:**

```typescript
// Truthy: value exists and is not false, not 0, not ""
function isTruthy(value: StateValue | undefined): boolean {
    return value !== undefined && value !== false && value !== 0 && value !== "";
}

function evaluateCondition(condition: StateCondition, state: Map<string, StateValue>): boolean {
    switch (condition.type) {
        case "check":
            const val = state.get(condition.name);
            return condition.op === "truthy" ? isTruthy(val) : !isTruthy(val);

        case "compare":
            const current = state.get(condition.name);
            if (current === undefined) return false;  // undefined fails all comparisons
            switch (condition.op) {
                case "==": return current === condition.value;
                case "!=": return current !== condition.value;
                case ">":  return (current as number) > (condition.value as number);
                case "<":  return (current as number) < (condition.value as number);
                case ">=": return (current as number) >= (condition.value as number);
                case "<=": return (current as number) <= (condition.value as number);
            }

        case "and":
            return condition.conditions.every(c => evaluateCondition(c, state));
        case "or":
            return condition.conditions.some(c => evaluateCondition(c, state));
    }
}

function applyEffect(effect: StateEffect, state: Map<string, StateValue>): void {
    switch (effect.type) {
        case "set":
            state.set(effect.name, effect.value);
            break;
        case "unset":
            state.delete(effect.name);
            break;
        case "toggle":
            const current = state.get(effect.name);
            state.set(effect.name, !current);
            break;
        case "increment":
            const num = (state.get(effect.name) as number) ?? 0;
            state.set(effect.name, num + effect.by);
            break;
    }
}
```

**Key constraints:**
- No DOM APIs (no `document`, no `window`, no `localStorage` directly — always uses `StorageAdapter`)
- No framework imports (no Solid, no React, nothing)
- Depends only on `@storytime/core`
- `StoryTraverser`/`resolveNext` must be pure and synchronous
- Config and save state use separate storage keys and separate stores

**Testing strategy:**
- Unit tests for `resolveNext` / `StoryTraverser` (given scene + state → expected traversal result)
- Unit tests for `GameState` (condition evaluation with all operators, effect application, serialization round-trip)
- Unit tests for `ConfigStore` (defaults, partial updates, persistence, subscribe/notify)
- Unit tests for `SaveManager` (versioning, migration between versions)
- Integration tests for `StoryEngine` (full traversal sequences using `MemoryStorageAdapter` and mock scene loader)
- All tests run in Node via vitest, no browser needed

**Save data format (v1):**
```typescript
type SaveData = {
    version: 1;
    state: Record<string, StateValue>;           // all state variables
    visitedChoices: Record<string, string[]>;     // sceneId → nodeId[]
    scenePath: NodePosition[];                   // nested scene stack
    lastClearPosition: NodePosition | null;
    choicesSinceClear: NodePosition[];           // for fast-forward replay
};
```

**Storage keys:**
- `{prefix}:save` — default save slot (game state, cleared on reset)
- `{prefix}:save:{slotName}` — named save slots
- `{prefix}:config` — user preferences (persists forever, survives game reset)

Where `{prefix}` defaults to `"storytime"`, configurable via `StoryConfig.storagePrefix`.

---

### @storytime/astro

**Purpose:** The complete Astro package: integration + UI components + themes + debug tools. This is what end users install.

**How it works (the Starlight model):**

The package exports a `storytime()` function that returns an Astro integration. When the user adds it to their `astro.config.mjs`, the integration:
1. Registers a content loader that watches `.mmd` files, parses them using `@storytime/core`, and validates output
2. Injects routes via Astro's `injectRoute()` API — the user's project has no pages
3. Generates static JSON endpoints for each scene
4. Injects client scripts (runtime + Solid components)
5. Applies base styles and user's custom CSS

The `.astro` pages and `.tsx` components live inside this package's source. They are NOT copied to the user's project. Astro resolves them from `node_modules` at build time.

**User's astro.config.mjs:**
```javascript
import { defineConfig } from "astro/config";
import storytime from "@storytime/astro";

export default defineConfig({
    integrations: [storytime()],
});
```

**User's storytime.config.ts (optional):**
```typescript
import { defineStoryConfig } from "@storytime/astro/config";

export default defineStoryConfig({
    scenes: "src/scenes",
    startScene: "intro",
    debug: true,
    defaults: {
        displayMode: "stream",
        theme: "dark",
    },
});
```

**Integration responsibilities:**
- `storytime()` — Astro integration function
- `defineStoryConfig()` — typed config helper
- Content loader:
  - Watches `config.scenes` directory for `.mmd` files (and other parser extensions)
  - Reads file content, determines parser by extension, calls `parser.parse()`
  - Runs `validateScene()` on output; logs warnings/errors to terminal during dev
  - On parse error: logs error with file path + line number, skips that scene (does not crash dev server)
  - On file change (dev watcher): re-parses only the changed file
- Route injection:
  - `GET /api/scenes/[id].json` — static endpoint per scene (prerendered at build)
  - `GET /` — main story page
  - `GET /debug` — debug page (injected only when `config.debug` is true and `import.meta.env.DEV`)
- Provides virtual module `virtual:storytime/config` for accessing resolved config in client code

**SolidJS components:**
- `StoryRoot.tsx` — top-level provider, initializes engine, registers scene loader (fetches from `/api/scenes/[id].json`)
- `DialoguePanel.tsx` — renders text nodes, handles display mode transitions
- `ChoiceList.tsx` — renders available choices, keyboard navigation (number keys, enter)
- `TextNode.tsx` — typewriter animation for a single text node
- `ImageNode.tsx` — renders inline images with alt text
- `ContinuePrompt.tsx` — "Press to continue" affordance for paged mode
- `SettingsPanel.tsx` — user config UI (speed, theme, display mode, font size)
- `DebugPanel.tsx` — state inspector, scene picker, flag toggles, go-to-node
- `ScenePicker.tsx` — searchable scene/node navigation
- `FlagToggles.tsx` — checkboxes/inputs for all variables in current scene
- `SpeedToggle.tsx` — quick playback speed control

**Solid bindings (the glue between runtime engine and Solid signals):**
- `useStoryEngine()` — instantiates engine once, subscribes to events, returns Solid signals:
  ```typescript
  {
      nodes: Accessor<(StoryNode & ChildRef & NodePosition)[]>,
      choices: Accessor<ResolvedChoice[]>,
      engine: StoryEngine,
  }
  ```
- `useConfig()` — wraps `ConfigStore` with Solid signals, applies CSS custom properties to `<html>` element
- `StoryContext.tsx` — Solid context provider that wires `useStoryEngine()` + `useConfig()` together

**Animation:**
- `typewriter.ts` — character-by-character reveal driven by token stream
- `tokens.ts` — splits HTML string into renderable tokens: `{ type: "char" | "tag" | "pause", ... }`
- Respects `prefers-reduced-motion` media query AND `config.reduceMotion` setting
- Speed controlled by `config.textSpeed` multiplier applied to base timing
- Space bar skips current node's animation (shows full text immediately)

**Debug tools (dev mode only):**
- Scene picker: searchable list of all scenes, click to jump
- Node picker: searchable list of nodes within current scene, click to jump
- Variable editor: auto-populated from current scene's `vars` array. Booleans show as checkboxes, strings as text inputs, numbers as number inputs.
- State inspector: live JSON view of full serialized game state
- Choice history: clickable list to rollback to any previous choice point
- Quick save/load: named slots for testing specific states

**Story config type:**
```typescript
type StoryConfig = {
    /** Directory containing scene files, relative to project root. Default: "src/scenes" */
    scenes?: string;

    /** Parsers to use. Default: [mermaid()] */
    parsers?: Parser[];

    /** Starting scene ID. Required. */
    startScene: string;

    /** Enable debug tools in dev mode. Default: true */
    debug?: boolean;

    /** Storage key prefix for localStorage. Default: "storytime" */
    storagePrefix?: string;

    /** Default user config values. Users can override via settings UI. */
    defaults?: Partial<UserConfig>;

    /** Path to user's custom CSS file for overriding theme variables. */
    customCss?: string;
};
```

**Key constraints:**
- Depends on `@storytime/core` and `@storytime/runtime`
- `astro` and `@astrojs/solid-js` as peer dependencies (user installs these)
- `solid-js` as a direct dependency
- All game logic flows through `@storytime/runtime`'s engine — components only render and handle input
- Components NEVER evaluate conditions, traverse nodes, or mutate game state directly
- Accessible: semantic HTML, ARIA live regions for new text, keyboard navigation, focus management

**Build note:** The `tsc` build compiles `index.ts`, `config.ts`, `loader.ts`, and `endpoints.ts` into `dist/`. The `.astro` pages and `.tsx` components are NOT compiled by tsc — they remain as source files in the package. Astro processes them at the user's build time when resolving injected routes from `node_modules`. The `tsconfig.json` for this package excludes `.astro` files from compilation and includes JSX settings for type-checking `.tsx` files:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "jsx": "preserve",
    "jsxImportSource": "solid-js"
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["src/**/*.astro"]
}
```

The `.astro` and `.tsx` component files are included in the published package via the `files` field:
```json
{
  "files": ["dist/", "src/pages/", "src/layouts/", "src/components/", "src/engine/", "src/animation/", "src/styles/"]
}
```

**Testing strategy:**
- Unit tests for loader logic (mock filesystem, verify correct parser is called, verify validation runs)
- Integration tests: minimal Astro project in `__fixtures__/` that builds successfully and produces expected JSON output
- Component tests with Solid's testing utilities (render components with mock engine, verify signal updates)
- E2E tests with Playwright:
  - Navigate scenes, make choices, verify correct text appears
  - Save/load persistence across page reload
  - Keyboard navigation (number keys for choices, space to skip, enter to continue)
  - Display mode switching
  - Theme switching
  - Reduced motion behavior
- Accessibility audits with axe-core in Playwright tests

---

## Mermaid Parser v1

**File:** `packages/core/src/parsers/mermaid/index.ts`

**Input:** String contents of a `.mmd` file containing a Mermaid flowchart diagram.

**Output:** A `Scene` object.

### Why a Custom Parser

`@mermaid-js/parser` does NOT support flowcharts. It only supports: info, packet, pie, architecture, gitGraph, radar, railroad, treeView, treemap, wardley, cynefin. Flowcharts are still parsed by the legacy parser inside the main `mermaid` package, which requires a DOM environment and DOMPurify.

The subset of Mermaid flowchart syntax we use is small enough to parse with a custom line-by-line parser (~300 lines). This eliminates `mermaid` (2.5MB+), `dompurify`, the pnpm override hack, and makes the parser synchronous and trivially testable.

Files remain valid Mermaid flowcharts — the VS Code Mermaid preview extension renders them correctly. Our semantic layer (edge text like `|hasKey, +gold|`) appears as label text in the preview, which is fine.

### Parsing Strategy

Line-by-line parser. Each line is matched against patterns in order:

1. **Comment**: starts with `%%` → skip
2. **Header**: `flowchart TD` or `flowchart LR` → validate it's a flowchart, skip (direction is ignored)
3. **Edge statement**: matches pattern `id1 ARROW id2` or `id1 ARROW|text| id2`
4. **Standalone vertex**: matches `id[text]` or `id(text)` etc. (vertex declared without an edge)

The parser maintains:
- A `Map<string, VertexInfo>` — vertex ID → shape + text (populated when first seen)
- An `Array<EdgeInfo>` — all edges in declaration order

After all lines are parsed, a second pass converts vertices + edges into the `Scene` structure.

### Tokenizer Output (Internal)

```typescript
type VertexInfo = {
    id: string;
    text?: string;            // raw text content (before markdown processing)
    shape: "square" | "round" | "diamond" | "subroutine" | "stadium" | "none";
};

type EdgeInfo = {
    sourceId: string;
    targetId: string;
    text?: string;            // raw edge label text
    head: "arrow" | "circle" | "cross" | "open";
    stroke: "normal" | "thick" | "dotted" | "invisible";
    length: number;           // number of dashes/equals (minimum 1)
};
```

### Mapping Rules

**Vertex shape → Node type:**

| Shape | Syntax | Node type |
|---|---|---|
| Square | `id[text]` | `TextNode` |
| Round | `id(text)` | `ChoiceNode` |
| Diamond | `id{text}` | `GateNode { strategy: "random" }` |
| Subroutine | `id[[text]]` | `TextNode { style: "emphasis" }` |
| Stadium | `id([text])` | `ChoiceNode { style: "minor" }` |
| None | bare `id` | `GateNode { strategy: "first" }` OR reserved keyword |

**Reserved keywords** (bare IDs with no shape that have special meaning):

| Keyword | Behavior |
|---|---|
| `begin` | Not emitted as a node. The edge `begin --> X` sets `scene.entryNodeId = "X"`. If no `begin` keyword exists, the source of the first edge is the entry node. |
| `return` | Emitted as `GateNode { id: "return", children: [], strategy: "first" }`. When the engine encounters a gate with no eligible children, it exits the scene. |
| `clear` | Emitted as `ClearNode { id: "clear", children: [...] }`. Children are whatever edges leave this node. |
| `reset` | Emitted as `CustomNode { id: "reset", name: "reset" }`. |

If a reserved keyword is used multiple times (e.g., two `clear` nodes), append a suffix: `clear`, `clear_2`, `clear_3`. Alternatively, the user can write `clear1`, `clear2` etc. — the parser checks if the ID *starts with* the keyword.

**Edge head → Semantics:**

| Head | Syntax | Meaning |
|---|---|---|
| Arrow | `-->` | Standard traversal to next node |
| Circle | `--o` | Hint that target is a choice. If target vertex has `[]` shape, override to choice. If target already has `()`, redundant. |
| Cross | `--x` | Reserved for future use. Treated as standard traversal for now. |
| Open | `---` | Standard traversal (no arrowhead rendered in preview, but functionally identical to `-->`) |

**Edge stroke → Delay style:**

| Stroke | Syntax | `Delay.style` |
|---|---|---|
| Normal | `-->` | `"dots"` |
| Thick | `==>` | `"pause"` |
| Dotted | `-.->` | `"fade"` |
| Invisible | `~~~` | No delay object emitted (immediate transition) |

**Edge length → Delay beats:**

Length is determined by counting the repeated characters in the arrow body:
- `-->` = length 1, `Delay.beats = 0`
- `--->` = length 2, `Delay.beats = 1`
- `---->` = length 3, `Delay.beats = 2`
- General rule: `beats = length - 1`

For thick/dotted strokes, same counting applies to `=` or `.` characters.

### Edge Text: Conditions & Effects Syntax

Edge text (the content between `|...|` in Mermaid edge labels) is a mini-expression language for checking and mutating state.

**Combinators:**

| Syntax | Meaning |
|---|---|
| `,` | AND — all comma-separated expressions must be true |
| `OR` | OR keyword (case-insensitive) — at least one side must be true |
| `(...)` | Parentheses for explicit grouping |

**Precedence:** `,` (AND) binds tighter than `OR`. Parentheses override precedence.

Examples:
- `hasKey, level > 5` → `{ type: "and", conditions: [check(hasKey), compare(level > 5)] }`
- `hasKey OR profession == poet` → `{ type: "or", conditions: [check(hasKey), compare(profession == poet)] }`
- `(hasKey OR hasPick), !doorOpened` → `{ type: "and", conditions: [or(hasKey, hasPick), check(!doorOpened)] }`
- `hasKey, (level > 5 OR profession == thief)` → `{ type: "and", conditions: [check(hasKey), or(compare(level>5), compare(profession==thief))] }`

**Conditions (read state):**

| Syntax | Meaning | Produces |
|---|---|---|
| `hasKey` | Truthy check (true, non-empty string, non-zero number) | `{ type: "check", name: "hasKey", op: "truthy" }` |
| `!hasKey` | Falsy check (false, undefined, empty string, 0) | `{ type: "check", name: "hasKey", op: "falsy" }` |
| `hasKey == true` | Strict equality to boolean | `{ type: "compare", name: "hasKey", op: "==", value: true }` |
| `hasKey == false` | Strict equality to boolean | `{ type: "compare", name: "hasKey", op: "==", value: false }` |
| `profession == poet` | String equality | `{ type: "compare", name: "profession", op: "==", value: "poet" }` |
| `profession != poet` | String inequality | `{ type: "compare", name: "profession", op: "!=", value: "poet" }` |
| `level > 5` | Numeric greater than | `{ type: "compare", name: "level", op: ">", value: 5 }` |
| `level >= 10` | Numeric greater or equal | `{ type: "compare", name: "level", op: ">=", value: 10 }` |
| `level < 3` | Numeric less than | `{ type: "compare", name: "level", op: "<", value: 3 }` |
| `visits <= 2` | Numeric less or equal | `{ type: "compare", name: "visits", op: "<=", value: 2 }` |

**Effects (write state):**

| Syntax | Meaning | Produces |
|---|---|---|
| `+hasKey` | Set to `true` | `{ type: "set", name: "hasKey", value: true }` |
| `-hasKey` | Unset (remove from state entirely) | `{ type: "unset", name: "hasKey" }` |
| `~hasKey` | Toggle boolean | `{ type: "toggle", name: "hasKey" }` |
| `hasKey = true` | Set to `true` | `{ type: "set", name: "hasKey", value: true }` |
| `hasKey = false` | Set to `false` | `{ type: "set", name: "hasKey", value: false }` |
| `profession = poet` | Set to string `"poet"` | `{ type: "set", name: "profession", value: "poet" }` |
| `level = 5` | Set to number `5` | `{ type: "set", name: "level", value: 5 }` |
| `level++` | Increment by 1 | `{ type: "increment", name: "level", by: 1 }` |
| `level--` | Decrement by 1 | `{ type: "increment", name: "level", by: -1 }` |
| `level += 3` | Increment by 3 | `{ type: "increment", name: "level", by: 3 }` |
| `level -= 2` | Decrement by 2 | `{ type: "increment", name: "level", by: -2 }` |

**Special shorthand:**

| Syntax | Meaning |
|---|---|
| `!` (bare, alone) | Same as before: `condition: { type: "check", name: "visited:<targetId>", op: "falsy" }` + sets `repeat: "once"` on target choice |

**Value type inference** (for right-hand side of `=` and `==`):**
- `true` / `false` → boolean
- Matches `/^-?\d+(\.\d+)?$/` → number
- Anything else → string (no quotes needed)

Strings never need quotes. The value is everything after the operator, trimmed. Limitation: string values cannot contain `,` or the word ` OR ` (with surrounding spaces) since those are expression delimiters. This is acceptable — state values are typically simple identifiers like `poet`, `warrior`, `red`.

**Distinguishing conditions from effects** (parser logic):

The parser identifies each token by checking in this order:
1. Starts with `+` → effect (set true)
2. Starts with `-` followed by a name (not a digit) → effect (unset)
3. Starts with `~` → effect (toggle)
4. Contains `++` → effect (increment)
5. Contains `--` → effect (decrement)
6. Contains `+=` → effect (increment by N)
7. Contains `-=` → effect (decrement by N)
8. Contains `==` → condition (comparison)
9. Contains `!=` → condition (comparison)
10. Contains `>=` → condition (comparison)
11. Contains `<=` → condition (comparison)
12. Contains `>` (not `>=`) → condition (comparison)
13. Contains `<` (not `<=`) → condition (comparison)
14. Contains `=` (not `==`, `!=`, `>=`, `<=`, `+=`, `-=`) → effect (assignment)
15. Starts with `!` (with content after) → condition (falsy check)
16. Is exactly `!` → special "once" shorthand
17. Bare name → condition (truthy check)

Order matters — multi-character operators (`==`, `!=`, `>=`, `<=`, `+=`, `-=`) are checked before single-character operators (`=`, `>`, `<`).

**Where effects are placed:**
- If the target node is a `ChoiceNode`: effects go on `ChoiceNode.onChoose` (applied when choice is selected)
- Otherwise: effects go on `ChildRef.effects` (applied when edge is traversed)

**Scope prefixing:**
- Variable names without a `:` separator are automatically prefixed with the scene ID: `hasKey` in scene `barista` → `barista:hasKey`
- Variable names containing `:` are left as-is: `global:gameStarted` remains `global:gameStarted`
- This prevents accidental collisions between scenes while allowing explicit cross-scene state

**Text processing (for vertex text, not edge text):**
- Vertex text content is processed through the inline markdown utility (bold, italic, code, links only — no block elements)
- Smart quotes are applied by default: straight `'` and `"` → curly equivalents, contextually
- Result stored in the `html` field of the node
- Smart quotes can be disabled via `ParserOptions.smartQuotes = false`

**Asset resolution:**
- If vertex text (before markdown processing) exactly matches a key in `ParserOptions.assets`, produce the corresponding node type:
  - `assets.get("sword.webp") === "image"` → `ImageNode { src: "sword.webp", alt: "" }`
  - `assets.get("confetti") === "custom"` → `CustomNode { name: "confetti" }`
- Asset lookup is provided to the parser via options. The parser NEVER accesses the filesystem.

**`vars` field population:**
- After all nodes are built, collect all unique variable names referenced in any `StateCondition` or `StateEffect`