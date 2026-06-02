import { describe, it, expect } from "vitest";
import { validateScenes } from "./validation.js";
import type { Scene } from "../types.js";

function makeScene(overrides: Partial<Scene> = {}): Scene {
    return {
        id: "test",
        entryNodeId: "start",
        vars: [],
        nodes: {
            start: { id: "start", type: "text", html: "<p>Hello</p>", children: [] },
        },
        ...overrides,
    };
}

describe("validateScenes", () => {
    describe("single scene — valid scenes", () => {
        it("passes a minimal valid scene", () => {
            const result = validateScenes(makeScene());
            expect(result.valid).toBe(true);
        });

        it("passes with multiple connected nodes", () => {
            const scene = makeScene({
                nodes: {
                    start: { id: "start", type: "text", html: "<p>Go</p>", children: [{ nodeId: "end" }] },
                    end: { id: "end", type: "text", html: "<p>Done</p>", children: [] },
                },
            });
            expect(validateScenes(scene).valid).toBe(true);
        });

        it("passes with a return gate (no children, no dead_end warning)", () => {
            const scene = makeScene({
                nodes: {
                    start: { id: "start", type: "text", html: "<p>Hi</p>", children: [{ nodeId: "returnGate" }] },
                    returnGate: { id: "returnGate", type: "gate", children: [] },
                },
            });
            const deadEnds = validateScenes(scene).issues.filter((i) => i.code === "dead_end");
            expect(deadEnds).toHaveLength(0);
        });
    });

    describe("single scene — missing entry node", () => {
        it("reports error when entryNodeId not in nodes", () => {
            const result = validateScenes(makeScene({ entryNodeId: "missing" }));
            expect(result.valid).toBe(false);
            expect(result.issues).toContainEqual(
                expect.objectContaining({ code: "missing_entry_node", severity: "error" })
            );
        });

        it("valid is false when there are error-severity issues", () => {
            const result = validateScenes(makeScene({ entryNodeId: "missing" }));
            expect(result.valid).toBe(false);
            expect(result.issues.some((i) => i.severity === "error")).toBe(true);
        });
    });

    describe("single scene — missing child refs", () => {
        it("reports error for ChildRef pointing to non-existent node", () => {
            const scene = makeScene({
                nodes: {
                    start: { id: "start", type: "text", html: "<p>Hi</p>", children: [{ nodeId: "ghost" }] },
                },
            });
            const result = validateScenes(scene);
            expect(result.valid).toBe(false);
            expect(result.issues).toContainEqual(
                expect.objectContaining({ code: "missing_child_ref", severity: "error", nodeId: "start" })
            );
        });

        it("reports one error per broken ref", () => {
            const scene = makeScene({
                nodes: {
                    start: {
                        id: "start",
                        type: "text",
                        html: "<p>Hi</p>",
                        children: [{ nodeId: "ghost1" }, { nodeId: "ghost2" }],
                    },
                },
            });
            const refs = validateScenes(scene).issues.filter((i) => i.code === "missing_child_ref");
            expect(refs).toHaveLength(2);
        });
    });

    describe("single scene — unreachable nodes", () => {
        it("warns about a node not reachable from entry", () => {
            const scene = makeScene({
                nodes: {
                    start: { id: "start", type: "text", html: "<p>Hi</p>", children: [] },
                    orphan: { id: "orphan", type: "text", html: "<p>Lost</p>", children: [] },
                },
            });
            const result = validateScenes(scene);
            expect(result.valid).toBe(true);
            expect(result.issues).toContainEqual(
                expect.objectContaining({ code: "unreachable_node", severity: "warning", nodeId: "orphan" })
            );
        });

        it("does not warn about reachable nodes", () => {
            const scene = makeScene({
                nodes: {
                    start: { id: "start", type: "text", html: "<p>Hi</p>", children: [{ nodeId: "next" }] },
                    next: { id: "next", type: "text", html: "<p>Next</p>", children: [] },
                },
            });
            const unreachable = validateScenes(scene).issues.filter((i) => i.code === "unreachable_node");
            expect(unreachable).toHaveLength(0);
        });

        it("handles cycles without infinite loop", () => {
            const scene = makeScene({
                nodes: {
                    start: { id: "start", type: "text", html: "<p>A</p>", children: [{ nodeId: "b" }] },
                    b: { id: "b", type: "text", html: "<p>B</p>", children: [{ nodeId: "start" }] },
                },
            });
            const result = validateScenes(scene);
            expect(result.valid).toBe(true);
            expect(result.issues.filter((i) => i.code === "unreachable_node")).toHaveLength(0);
        });
    });

    describe("single scene — dead ends", () => {
        it("warns when a non-gate leaf node has no children", () => {
            const result = validateScenes(makeScene());
            expect(result.issues).toContainEqual(
                expect.objectContaining({ code: "dead_end", severity: "warning", nodeId: "start" })
            );
        });

        it("does not warn for gate node with id starting with 'return'", () => {
            const scene = makeScene({
                nodes: {
                    start: {
                        id: "start",
                        type: "text",
                        html: "<p>Hi</p>",
                        children: [{ nodeId: "return" }, { nodeId: "returnToMenu" }],
                    },
                    return: { id: "return", type: "gate", children: [] },
                    returnToMenu: { id: "returnToMenu", type: "gate", children: [] },
                },
            });
            expect(validateScenes(scene).issues.filter((i) => i.code === "dead_end")).toHaveLength(0);
        });

        it("warns for gate node not starting with 'return' and no children", () => {
            const scene = makeScene({
                nodes: {
                    start: { id: "start", type: "text", html: "<p>Hi</p>", children: [{ nodeId: "branchGate" }] },
                    branchGate: { id: "branchGate", type: "gate", children: [] },
                },
            });
            expect(validateScenes(scene).issues).toContainEqual(
                expect.objectContaining({ code: "dead_end", severity: "warning", nodeId: "branchGate" })
            );
        });
    });

    describe("single scene — issue context fields", () => {
        it("attaches sceneId to all issues", () => {
            const scene = makeScene({ id: "myScene", entryNodeId: "nope" });
            for (const issue of validateScenes(scene).issues) {
                expect(issue.sceneId).toBe("myScene");
            }
        });

        it("valid is true when only warnings are present", () => {
            const scene = makeScene({
                nodes: {
                    start: { id: "start", type: "text", html: "<p>Hi</p>", children: [] },
                    unreachable: { id: "unreachable", type: "text", html: "<p>Lost</p>", children: [] },
                },
            });
            const result = validateScenes(scene);
            expect(result.valid).toBe(true);
            expect(result.issues.every((i) => i.severity === "warning")).toBe(true);
        });

        it("valid is false when any issue is an error", () => {
            expect(validateScenes(makeScene({ entryNodeId: "nope" })).valid).toBe(false);
        });
    });

    describe("multiple scenes — cross-scene refs", () => {
        it("passes when scene refs resolve correctly", () => {
            const story: Scene[] = [
                {
                    id: "intro",
                    entryNodeId: "start",
                    vars: [],
                    nodes: {
                        start: {
                            id: "start",
                            type: "text",
                            html: "<p>Intro</p>",
                            children: [{ nodeId: "goToChapter" }],
                        },
                        goToChapter: { id: "goToChapter", type: "scene", sceneId: "chapter1", children: [] },
                    },
                },
                {
                    id: "chapter1",
                    entryNodeId: "start",
                    vars: [],
                    nodes: {
                        start: { id: "start", type: "text", html: "<p>Chapter 1</p>", children: [] },
                    },
                },
            ];
            expect(validateScenes(story).valid).toBe(true);
        });

        it("reports error when SceneNode references non-existent scene", () => {
            const story: Scene[] = [
                {
                    id: "intro",
                    entryNodeId: "start",
                    vars: [],
                    nodes: {
                        start: {
                            id: "start",
                            type: "text",
                            html: "<p>Go</p>",
                            children: [{ nodeId: "jump" }],
                        },
                        jump: { id: "jump", type: "scene", sceneId: "missing-scene", children: [] },
                    },
                },
            ];
            const result = validateScenes(story);
            expect(result.valid).toBe(false);
            expect(result.issues).toContainEqual(
                expect.objectContaining({
                    code: "missing_scene_ref",
                    severity: "error",
                    nodeId: "jump",
                    sceneId: "intro",
                })
            );
        });
    });

    describe("multiple scenes — orphan scenes", () => {
        it("warns when a scene is not referenced by any other scene", () => {
            const story = [makeScene({ id: "intro" }), makeScene({ id: "unused" })];
            const orphans = validateScenes(story).issues.filter((i) => i.code === "orphan_scene");
            expect(orphans.map((i) => i.sceneId)).toContain("intro");
            expect(orphans.map((i) => i.sceneId)).toContain("unused");
        });

        it("does not warn for scenes that are referenced", () => {
            const story: Scene[] = [
                {
                    id: "intro",
                    entryNodeId: "start",
                    vars: [],
                    nodes: {
                        start: { id: "start", type: "scene", sceneId: "chapter1", children: [] },
                    },
                },
                {
                    id: "chapter1",
                    entryNodeId: "start",
                    vars: [],
                    nodes: {
                        start: { id: "start", type: "text", html: "<p>Hi</p>", children: [] },
                    },
                },
            ];
            const orphans = validateScenes(story).issues.filter((i) => i.code === "orphan_scene");
            expect(orphans.map((i) => i.sceneId)).not.toContain("chapter1");
        });

        it("does not produce orphan warnings for a single scene", () => {
            const orphans = validateScenes(makeScene()).issues.filter((i) => i.code === "orphan_scene");
            expect(orphans).toHaveLength(0);
        });
    });

    describe("multiple scenes — aggregated per-scene issues", () => {
        it("includes per-scene errors from each scene", () => {
            const result = validateScenes([makeScene({ id: "bad", entryNodeId: "missing" })]);
            expect(result.valid).toBe(false);
            expect(result.issues).toContainEqual(
                expect.objectContaining({ code: "missing_entry_node", sceneId: "bad" })
            );
        });

        it("valid is false if any issue across any scene is an error", () => {
            expect(validateScenes([makeScene({ entryNodeId: "nope" })]).valid).toBe(false);
        });

        it("valid is true when only warnings exist across all scenes", () => {
            const scene = makeScene({
                nodes: {
                    start: { id: "start", type: "text", html: "<p>Hi</p>", children: [] },
                    orphan: { id: "orphan", type: "text", html: "<p>Lost</p>", children: [] },
                },
            });
            const result = validateScenes([scene]);
            expect(result.valid).toBe(true);
            expect(result.issues.some((i) => i.severity === "warning")).toBe(true);
        });
    });
});
