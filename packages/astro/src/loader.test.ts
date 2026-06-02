import { describe, it, expect } from "vitest";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { loadContent } from "./loader.js";
import { MermaidFlowchartParser } from "@probablyduncan/understory-core";

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");
const parser = new MermaidFlowchartParser();

function fixtureRoot(subdir: string = "") {
    return pathToFileURL(join(FIXTURES_DIR, subdir) + "/");
}

describe("loadContent", () => {
    describe("asset scanning", () => {
        it("populates images set from image source directory", async () => {
            const { content } = await loadContent(
                [{ dir: "images", type: "images" }],
                fixtureRoot(),
                "intro.mmd",
            );
            expect(content.images).toContain("sword.webp");
            expect(content.images).toContain("forest.png");
            expect(content.scenes.size).toBe(0);
            expect(content.custom.size).toBe(0);
        });

        it("populates custom set with basename-without-extension", async () => {
            const { content } = await loadContent(
                [{ dir: "custom", type: "custom" }],
                fixtureRoot(),
                "intro.mmd",
            );
            expect(content.custom).toContain("MyRenderer");
        });

        it("respects explicit extensions override", async () => {
            const { content } = await loadContent(
                [{ dir: "images", type: "images", extensions: [".webp"] }],
                fixtureRoot(),
                "intro.mmd",
            );
            expect(content.images).toContain("sword.webp");
            expect(content.images).not.toContain("forest.png");
        });

        it("returns empty sets for a directory that does not exist", async () => {
            const { content } = await loadContent(
                [{ dir: "nonexistent", type: "images" }],
                fixtureRoot(),
                "intro.mmd",
            );
            expect(content.images.size).toBe(0);
        });
    });

    describe("scene parsing", () => {
        it("parses valid scene files and populates scenes set", async () => {
            const { content, scenes } = await loadContent(
                [{ dir: "scenes", type: "scenes", parser }],
                fixtureRoot(),
                "intro.mmd",
            );
            expect(content.scenes).toContain("intro.mmd");
            expect(content.scenes).toContain("chapter1.mmd");
            const intro = scenes.find((s) => s.id === "intro.mmd");
            expect(intro?.scene).not.toBeNull();
        });

        it("derives scene ID as basename including extension", async () => {
            const { scenes } = await loadContent(
                [{ dir: "scenes", type: "scenes", parser }],
                fixtureRoot(),
                "intro.mmd",
            );
            expect(scenes.map((s) => s.id)).toContain("intro.mmd");
        });

        it("returns issues (not throw) for a malformed scene", async () => {
            const { scenes } = await loadContent(
                [{ dir: "scenes", type: "scenes", parser }],
                fixtureRoot(),
                "intro.mmd",
            );
            const broken = scenes.find((s) => s.id === "broken.mmd");
            expect(broken).toBeDefined();
            expect(broken!.scene).toBeNull();
            expect(broken!.issues.length).toBeGreaterThan(0);
            expect(broken!.issues[0].severity).toBe("error");
        });

        it("uses parser.extensions when ContentSource.extensions is omitted", async () => {
            const { content } = await loadContent(
                [{ dir: "scenes", type: "scenes", parser }],
                fixtureRoot(),
                "intro.mmd",
            );
            // parser.extensions = [".mmd"], so only .mmd files should appear
            for (const id of content.scenes) {
                expect(id.endsWith(".mmd")).toBe(true);
            }
        });

        it("resolves scene cross-references when assets are loaded together", async () => {
            const { scenes } = await loadContent(
                [
                    { dir: "scenes", type: "scenes", parser },
                    { dir: "images", type: "images" },
                ],
                fixtureRoot(),
                "intro.mmd",
            );
            const intro = scenes.find((s) => s.id === "intro.mmd");
            expect(intro?.scene).not.toBeNull();
            // chapter1.mmd is a known scene, so the SceneNode in intro should be resolved
            const sceneNode = Object.values(intro!.scene!.nodes).find(
                (n) => n.type === "scene",
            );
            expect(sceneNode).toBeDefined();
            expect((sceneNode as { sceneId: string }).sceneId).toBe("chapter1.mmd");
        });
    });

    describe("scene ID collision", () => {
        it("warns on collision and keeps the first scene found", async () => {
            const tmp = join(tmpdir(), `understory-test-${Date.now()}`);
            const subA = join(tmp, "a");
            const subB = join(tmp, "b");
            await mkdir(subA, { recursive: true });
            await mkdir(subB, { recursive: true });

            const scene = "flowchart TD\n    begin --> x[Hello.]\n";
            await writeFile(join(subA, "dupe.mmd"), scene);
            await writeFile(join(subB, "dupe.mmd"), scene);

            try {
                const { content, scenes } = await loadContent(
                    [
                        { dir: "a", type: "scenes", parser },
                        { dir: "b", type: "scenes", parser },
                    ],
                    pathToFileURL(tmp + "/"),
                    "intro.mmd",
                );

                // Only one scene with id "dupe.mmd" should be present
                expect(content.scenes.size).toBe(1);
                expect(scenes.filter((s) => s.id === "dupe.mmd").length).toBe(1);

                // Collision warning should be attached to the winning scene (dupe.mmd)
                const dupeScene = scenes.find((s) => s.id === "dupe.mmd");
                const collision = dupeScene?.issues.find((i) => i.code === "scene_id_collision");
                expect(collision).toBeDefined();
                expect(collision!.severity).toBe("warning");
            } finally {
                await rm(tmp, { recursive: true, force: true });
            }
        });
    });

    describe("cross-scene validation", () => {
        it("surfaces missing_scene_ref when a referenced scene fails to parse", async () => {
            // intro.mmd references broken.mmd. broken.mmd is scanned (so the parser
            // creates a SceneNode for it) but fails to parse (so it's absent from
            // the parsedScenes array passed to validateScenes). This triggers missing_scene_ref.
            const tmp = join(tmpdir(), `understory-test-${Date.now()}`);
            await mkdir(tmp, { recursive: true });

            await writeFile(
                join(tmp, "intro.mmd"),
                "flowchart TD\n    begin --> a\n    a --> portal[[broken.mmd]]\n",
            );
            await writeFile(join(tmp, "broken.mmd"), "not valid mermaid %%%\n");

            try {
                const { scenes } = await loadContent(
                    [{ dir: ".", type: "scenes", parser }],
                    pathToFileURL(tmp + "/"),
                    "intro.mmd",
                );

                const allIssues = scenes.flatMap((s) => s.issues);
                const missingRef = allIssues.find((i) => i.code === "missing_scene_ref");
                expect(missingRef).toBeDefined();
                expect(missingRef!.severity).toBe("error");
            } finally {
                await rm(tmp, { recursive: true, force: true });
            }
        });

        it("does not flag the start scene as orphan when startSceneId is provided", async () => {
            const tmp = join(tmpdir(), `understory-test-${Date.now()}`);
            await mkdir(tmp, { recursive: true });

            await writeFile(join(tmp, "intro.mmd"), "flowchart TD\n    begin --> a[Start.]\n");
            await writeFile(join(tmp, "other.mmd"), "flowchart TD\n    begin --> a[Other.]\n");

            try {
                const { scenes } = await loadContent(
                    [{ dir: ".", type: "scenes", parser }],
                    pathToFileURL(tmp + "/"),
                    "intro.mmd",
                );

                const introIssues = scenes.find((s) => s.id === "intro.mmd")?.issues ?? [];
                expect(introIssues.filter((i) => i.code === "orphan_scene")).toHaveLength(0);

                // other.mmd is not reachable from intro.mmd → still flagged
                const otherIssues = scenes.find((s) => s.id === "other.mmd")?.issues ?? [];
                expect(otherIssues.find((i) => i.code === "orphan_scene")).toBeDefined();
            } finally {
                await rm(tmp, { recursive: true, force: true });
            }
        });
    });
});
