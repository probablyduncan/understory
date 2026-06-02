understory-core is a pure typescript library (no node, no dom, no framework deps) which defines types and parsers for the underlying data that defines a story.

ships built-in parsers
exposes story validation utility

validation:

a function that takes in a list of scene objects and validates that their nodes are all valid, 



# @probablyduncan/understory-core

Pure TypeScript library for story data types and parsing. No Node.js APIs, no DOM, no framework dependencies.

## Purpose

Defines the schema (types) that all other packages share, provides the `Parser` interface, ships the built-in parsers, and exposes scene/story validation utilities.

## Exports

| Entry point | Contents |
|---|---|
| `@probablyduncan/understory-core` | All types, `validateScene`, `validateStory` |
| `@probablyduncan/understory-core/parsers` | `Parser` interface, `ParserOptions`, `ParseError`, all built-in parsers |

Types are defined in `src/types.ts`. The `Parser` interface, `ParserOptions`, and `ParseError` class live in `src/parsers/index.ts`. The shared edge text parser lives in `src/parsers/stateExpression.ts`.

## Schema

See `src/types.ts` for the full definitions of `Scene`, `StoryNode`, `ChildRef`, `Delay`, `StateCondition`, `StateEffect`, and `StateValue`.

**Node type behavior:**

- `ChoiceNode.repeat`:
  - `"once"` — hidden after being selected (the `!` edge shorthand sets this automatically)
  - `"fade"` — remains visible but styled as visited/dimmed
  - `"always"` — always shown in normal state

- `ClearNode` — not emitted as a `render` result; the engine emits `clear` and continues to children immediately.

- `GateNode` — `strategy: "first"` selects the first eligible child (default); `strategy: "random"` selects randomly from eligible children. A gate whose ID starts with `"return"` with no eligible children triggers scene exit. Any other gate with no eligible children is a runtime error.

- `SceneNode` — pushes return position onto the scene path stack and loads the referenced scene from its `entryNodeId`. A `"return"` gate pops the stack.

- `ChildRef.effects` — applied immediately when the edge is traversed, before the target node is rendered.

## Validation

```typescript
validateScene(scene: Scene): ValidationResult   // dead ends, missing refs, unreachable nodes
validateStory(scenes: Scene[]): ValidationResult // cross-scene: missing scene refs, orphan scenes
```

Defined in `src/validation.ts`.

## Parser Interface

Defined in `src/parsers/index.ts`. Parsers receive string content (not file paths), are synchronous, and have no side effects. `ParserOptions.assets` is a map of asset filenames to their type (`"image"`, `"custom"`, `"scene"`), built by the integration layer.

See `src/parsers/parser-dir/README.md` for the parser specifics.

## Key Constraints

- No Node.js APIs (`fs`, `path`)
- No DOM APIs
- Synchronous only
- Zero runtime dependencies

## Testing

```bash
pnpm --filter @probablyduncan/understory-core test
pnpm --filter @probablyduncan/understory-core test:watch
```