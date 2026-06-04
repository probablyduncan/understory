# @probablyduncan/understory-astro

The complete Astro package: integration + UI rendering + themes + debug tools. This is what end users install.

## Purpose

Bridges `@probablyduncan/understory-core` and `@probablyduncan/understory-runtime` with Astro's build system and a SolidJS UI layer. Handles file watching, route injection, JSON endpoint generation, layout management, CSS theming, and text animation.

## Usage

**astro.config.mjs:**
```javascript
import { defineConfig } from "astro/config";
import understory from "@probablyduncan/understory-astro";

export default defineConfig({
    integrations: [understory()],
});
```

**understory.config.ts (optional):**
```typescript
import { defineUnderstoryConfig } from "@probablyduncan/understory-astro/config";

export default defineUnderstoryConfig({
    scenes: "src/scenes",
    startScene: "intro",
    debug: true,
    defaults: {
        displayMode: "stream",
        theme: "dark",
    },
});
```

If no config file exists and `startScene` is not provided, the integration throws at build time:
> `UnderstoryConfigError: startScene is required. Create an understory.config.ts file in your project root.`

## UnderstoryConfig

```typescript
type UnderstoryConfig = {
    scenes?: string;             // default: "src/scenes"
    parsers?: Parser[];          // default: [mermaid()]
    startScene: string;          // required
    debug?: boolean;             // default: true (only active in DEV mode)
    storagePrefix?: string;      // default: "understory"
    defaults?: Partial<UserConfig>;
    stylesheet?: string;         // path to user's CSS override file
    defaultLayout?: string;      // layout name for scenes without %% layout: ...
    layouts?: Record<string, unknown>;  // custom layout components
};
```

## What the Integration Does

1. Registers a content loader watching `config.scenes` for `.mmd` files
2. Parses each file, runs `validateScene()`, logs errors without crashing the dev server
3. Injects routes via `injectRoute()`:
   - `GET /` — main story page
   - `GET /api/scenes/[id].json` — prerendered JSON per scene
   - `GET /debug` — only injected when `debug: true` AND `DEV` mode
4. Provides `virtual:understory/config` for accessing resolved config in client code
5. Applies base styles and user's custom CSS

## Layout System

Scenes choose a layout via a front-matter comment:
```
%% layout: title-card
```

Resolution order:
1. `scene.layout` (from the `.mmd` file)
2. `UnderstoryConfig.defaultLayout`
3. Package's built-in default layout

Custom layouts can be registered in `understory.config.ts`:
```typescript
import TitleCard from "./src/layouts/title-card.tsx";

export default defineUnderstoryConfig({
    startScene: "intro",
    layouts: { "title-card": TitleCard },
});
```

Or auto-loaded from `src/layouts/*.tsx` (convenience, no registration needed).

**Transition ownership:** Layout components control mount/unmount transitions. The engine waits for the entry transition before rendering, and stops rendering before the exit transition begins.

**Build-time validation:** Unknown layout names are surfaced as errors during dev/build. At runtime, unknown layouts fall back to the default.

## CSS & Theming

All package styles are wrapped in a `@layer understory` cascade layer, so user overrides always win without `!important`.

**Custom properties (selection):**
```css
--us-color-bg
--us-color-text
--us-color-accent
--us-color-muted
--us-font-body
--us-font-size-base
--us-max-width
--us-timing-char       /* typewriter speed */
--us-timing-pause
--us-timing-fade
```

**User overrides:**
```css
/* custom.css */
:root {
    --us-color-bg: #f5f5dc;
    --us-font-body: "Courier New", monospace;
}
```

Referenced in config via `stylesheet: "./custom.css"`.

**Prebuilt themes:** `terminal`, `paper`, `minimal`. Applied via `[data-theme]` attribute on `<html>`.

**Reduced motion:** `--us-timing-*` variables are zeroed out by the `prefers-reduced-motion` media query. The Solid binding also applies them programmatically when `config.reduceMotion` is true.

## CSS Class Naming

All component classes use the `us-` prefix:
- `us-dialogue`, `us-text`, `us-choice`, `us-choice--visited`, `us-choice-group`, `us-debug`, `us-settings`

## Display Modes

Display mode logic lives in the UI layer, not the engine. The engine emits nodes; the UI decides how to present them based on `UserConfig.displayMode`:

| Mode | Behavior |
|---|---|
| `"stream"` | Nodes appear one by one with typewriter animation |
| `"paged"` | Content shown a page at a time |
| `"instant"` | All text appears immediately |

## Client Config Priority (highest → lowest)

1. User's localStorage override (settings UI)
2. Author's defaults in `understory.config.ts`
3. System preferences (`prefers-reduced-motion`, `prefers-color-scheme`)
4. Hardcoded defaults in `@probablyduncan/understory-runtime`

## Build Note

`tsc` compiles `index.ts`, `config.ts`, `loader.ts`, and `endpoints.ts` into `dist/`. The `.astro` pages and `.tsx` components are NOT compiled by tsc — Astro processes them at the user's build time when resolving injected routes from `node_modules`. They are included in the published package via the `files` field.

## Testing

```bash
pnpm --filter @probablyduncan/understory-astro test
pnpm --filter @probablyduncan/understory-astro test:e2e
```

- Unit tests: loader logic, mock filesystem
- Integration tests: minimal Astro fixture project in `__fixtures__/basic-project/`
- E2E tests (Playwright): navigation, save/load, keyboard, display modes, accessibility (axe-core)
