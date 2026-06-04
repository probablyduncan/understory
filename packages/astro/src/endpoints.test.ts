import { describe, it, expect, vi } from "vitest";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { buildSceneEndpoints, buildScenesVirtualModuleCode } from "./endpoints.js";
import understory from "./index.js";
import { MermaidFlowchartParser } from "@probablyduncan/understory-core";
import type { LoadedScene } from "./loader.js";
import type { Scene } from "@probablyduncan/understory-core";

function makeScene(id: string): Scene {
    return {
        id,
        nodes: { begin: { id: "begin", type: "text", html: "Hello", children: [] } },
        entryNodeId: "begin",
        vars: [],
    };
}

function makeLoadedScene(id: string, scene: Scene | null = makeScene(id)): LoadedScene {
    return { id, filepath: `/fixtures/${id}`, scene, issues: [] };
}

describe("buildSceneEndpoints", () => {
    it("returns an empty map for empty input", () => {
        expect(buildSceneEndpoints([])).toEqual(new Map());
    });

    it("includes scenes with non-null scene objects", () => {
        const scene = makeScene("intro.mmd");
        const result = buildSceneEndpoints([makeLoadedScene("intro.mmd", scene)]);
        expect(result.size).toBe(1);
        expect(result.get("intro.mmd")).toBe(scene);
    });

    it("filters out scenes with null scene objects", () => {
        const result = buildSceneEndpoints([makeLoadedScene("broken.mmd", null)]);
        expect(result.size).toBe(0);
    });

    it("handles mixed valid and failed parses", () => {
        const loaded = [
            makeLoadedScene("intro.mmd"),
            makeLoadedScene("chapter1.mmd"),
            makeLoadedScene("broken.mmd", null),
        ];
        const result = buildSceneEndpoints(loaded);
        expect(result.size).toBe(2);
        expect(result.has("intro.mmd")).toBe(true);
        expect(result.has("chapter1.mmd")).toBe(true);
        expect(result.has("broken.mmd")).toBe(false);
    });
});

describe("buildScenesVirtualModuleCode", () => {
    it("returns valid module syntax for an empty map", () => {
        const code = buildScenesVirtualModuleCode(new Map());
        expect(code).toBe("export const scenes = new Map([]);");
    });

    it("serializes a single scene entry", () => {
        const scene = makeScene("intro.mmd");
        const code = buildScenesVirtualModuleCode(new Map([["intro.mmd", scene]]));
        expect(code).toBe(
            `export const scenes = new Map([["intro.mmd",${JSON.stringify(scene)}]]);`,
        );
    });

    it("serializes multiple scene entries", () => {
        const intro = makeScene("intro.mmd");
        const chapter = makeScene("chapter1.mmd");
        const code = buildScenesVirtualModuleCode(
            new Map([
                ["intro.mmd", intro],
                ["chapter1.mmd", chapter],
            ]),
        );
        expect(code).toContain('"intro.mmd"');
        expect(code).toContain('"chapter1.mmd"');
        expect(code).toContain(JSON.stringify(intro));
        expect(code).toContain(JSON.stringify(chapter));
    });

    it("produces code that evaluates to the correct Map", () => {
        const scene = makeScene("intro.mmd");
        const code = buildScenesVirtualModuleCode(new Map([["intro.mmd", scene]]));
        // strip the `export` keyword and evaluate as an expression
        const result = eval(`(function(){ ${code.replace(/^export /, "")}; return scenes; })()`);
        expect(result).toBeInstanceOf(Map);
        expect(result.size).toBe(1);
        expect(result.get("intro.mmd")).toEqual(scene);
    });
});

describe("understory integration: scene endpoints", () => {
    const parser = new MermaidFlowchartParser();

    it("injects /api/scenes/[id].json route and registers Vite plugin", async () => {
        const tmp = join(tmpdir(), `understory-endpoints-test-${Date.now()}`);
        await mkdir(tmp, { recursive: true });
        await writeFile(
            join(tmp, "intro.mmd"),
            "flowchart TD\n    begin --> a[Hello.]\n",
        );

        try {
            const integration = understory({
                startSceneId: "intro.mmd",
                content: [{ dir: ".", type: "scenes", parser }],
            });

            const injectedRoutes: unknown[] = [];
            const updatedConfigs: unknown[] = [];
            const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };

            const hook = integration.hooks["astro:config:setup"];
            if (!hook) throw new Error("hook not registered");

            await hook({
                config: { root: pathToFileURL(tmp + "/") },
                logger,
                injectRoute: (r: unknown) => injectedRoutes.push(r),
                updateConfig: (c: unknown) => updatedConfigs.push(c),
            } as unknown as Parameters<typeof hook>[0]);

            // Route is injected
            expect(injectedRoutes).toHaveLength(1);
            const route = injectedRoutes[0] as { pattern: string; entrypoint: string; prerender: boolean };
            expect(route.pattern).toBe("/api/scenes/[id].json");
            expect(route.prerender).toBe(true);
            expect(route.entrypoint).toContain("scene.ts");

            // Vite plugin is registered
            expect(updatedConfigs).toHaveLength(1);
            const config = updatedConfigs[0] as { vite: { plugins: any[] } };
            const plugin = config.vite.plugins[0];
            expect(plugin.name).toBe("understory:virtual-scenes");

            // Plugin resolves virtual module ID
            const resolved = plugin.resolveId("virtual:understory/scenes");
            expect(resolved).toBe("\0virtual:understory/scenes");
            expect(plugin.resolveId("something-else")).toBeUndefined();

            // Plugin loads module code containing the scene
            const code = plugin.load("\0virtual:understory/scenes");
            expect(code).toContain("intro.mmd");
            expect(code).toContain("export const scenes = new Map(");
            expect(plugin.load("other")).toBeUndefined();
        } finally {
            await rm(tmp, { recursive: true, force: true });
        }
    });

    it("excludes scenes that failed to parse from the virtual module", async () => {
        const tmp = join(tmpdir(), `understory-endpoints-test-${Date.now()}`);
        await mkdir(tmp, { recursive: true });
        await writeFile(join(tmp, "intro.mmd"), "flowchart TD\n    begin --> a[Hello.]\n");
        await writeFile(join(tmp, "broken.mmd"), "not valid %%%\n");

        try {
            const integration = understory({
                startSceneId: "intro.mmd",
                content: [{ dir: ".", type: "scenes", parser }],
            });

            const updatedConfigs: unknown[] = [];
            const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
            const hook = integration.hooks["astro:config:setup"];
            if (!hook) throw new Error("hook not registered");

            await hook({
                config: { root: pathToFileURL(tmp + "/") },
                logger,
                injectRoute: vi.fn(),
                updateConfig: (c: unknown) => updatedConfigs.push(c),
            } as unknown as Parameters<typeof hook>[0]);

            const config = updatedConfigs[0] as { vite: { plugins: any[] } };
            const plugin = config.vite.plugins[0];
            const code = plugin.load("\0virtual:understory/scenes") as string;

            expect(code).toContain("intro.mmd");
            expect(code).not.toContain("broken.mmd");
        } finally {
            await rm(tmp, { recursive: true, force: true });
        }
    });

    it("logs errors for scenes with issues but still injects the route", async () => {
        const tmp = join(tmpdir(), `understory-endpoints-test-${Date.now()}`);
        await mkdir(tmp, { recursive: true });
        await writeFile(join(tmp, "intro.mmd"), "flowchart TD\n    begin --> a[Hello.]\n");
        await writeFile(join(tmp, "broken.mmd"), "not valid %%%\n");

        try {
            const integration = understory({
                startSceneId: "intro.mmd",
                content: [{ dir: ".", type: "scenes", parser }],
            });

            const injectedRoutes: unknown[] = [];
            const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
            const hook = integration.hooks["astro:config:setup"];
            if (!hook) throw new Error("hook not registered");

            await hook({
                config: { root: pathToFileURL(tmp + "/") },
                logger,
                injectRoute: (r: unknown) => injectedRoutes.push(r),
                updateConfig: vi.fn(),
            } as unknown as Parameters<typeof hook>[0]);

            expect(logger.error).toHaveBeenCalled();
            expect(injectedRoutes).toHaveLength(1);
        } finally {
            await rm(tmp, { recursive: true, force: true });
        }
    });
});
