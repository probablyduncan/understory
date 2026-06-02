# @probablyduncan/understory-runtime

Framework-agnostic game engine. Manages traversal, state, save/load, config, and events. No DOM, no framework, no async in the traversal loop.

## Purpose

Wraps the pure traversal function (`resolveNext`) with a stateful engine that handles scene loading, game state, save slots, user config preferences, and a typed event bus.

## Exports

| Symbol | Description |
|---|---|
| `createEngine(config)` | Creates a `StoryEngine` instance |
| `createConfigStore(storage, key, defaults?)` | Creates a `ConfigStore` instance |
| `resolveNext(children, scene, state, sceneId)` | Pure traversal function (exported for testing/advanced use) |
| `LocalStorageAdapter` | Default browser storage adapter |
| `MemoryStorageAdapter` | In-memory adapter (for testing) |

All types (`StoryEngine`, `ConfigStore`, `UserConfig`, `StorageAdapter`, `NodePosition`, `ResolvedChoice`, `TraversalResult`, `EngineEvents`, `SaveData`, `EngineConfig`) are defined in `src/types.ts`.

## Behavior Notes

**Lifecycle:** `init()` must be awaited before `start()`. The engine emits no events before `init()` resolves.

**Error handling:** The engine emits `error` events rather than throwing in async traversal.

**`ClearNode`:** Not returned as a `render` result. The traverser handles it internally, emits `clear`, and continues to children.

**Config vs save state:** These are completely separate stores with separate lifecycles. `UserConfig` persists across `engine.reset()`. Game state does not.

**Display mode:** The engine emits nodes and choices — it does not know about display modes. The UI layer reads `UserConfig.displayMode` and decides how to present events.

**`isTruthy` rule:** A state value is truthy if it is not `undefined`, `false`, `0`, or `""`. This means an unset variable (`undefined`) is distinct from an explicitly falsy one (`false`).

## Storage Keys

Prefix defaults to `"understory"`, configurable via `EngineConfig.storagePrefix`.

| Key | Contents | Cleared on reset? |
|---|---|---|
| `{prefix}:save` | Default save slot | Yes |
| `{prefix}:save:{slotName}` | Named save slot | Only when explicitly deleted |
| `{prefix}:config` | User preferences | Never |

## Internal Architecture

| Module | Role |
|---|---|
| `engine.ts` | `StoryEngine` implementation; wraps traversal with side effects |
| `traverser.ts` | `resolveNext()` — pure function: (children, scene, state, sceneId) → TraversalResult |
| `state.ts` | `GameState` class; condition evaluation, effect application, serialization |
| `save.ts` | `SaveManager`; serialization, versioning, migration |
| `config.ts` | `createConfigStore()`; user preferences, separate lifecycle |
| `events.ts` | `EventBus`; typed on/off/once emitter |
| `adapters/` | `LocalStorageAdapter`, `MemoryStorageAdapter` |

## Key Constraints

- No DOM APIs
- No framework imports
- Depends only on `@probablyduncan/understory-core`
- `resolveNext` must be pure and synchronous

## Testing

```bash
pnpm --filter @probablyduncan/understory-runtime test
pnpm --filter @probablyduncan/understory-runtime test:watch
```

All tests run in Node via vitest. `MemoryStorageAdapter` and mock scene loaders are used throughout — no browser needed.
