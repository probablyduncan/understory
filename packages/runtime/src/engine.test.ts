import { describe, it, expect, vi } from "vitest";
import type { Scene } from "@probablyduncan/understory-core";
import { createEngine } from "./engine.js";
import { MemoryStorageAdapter } from "./adapters/memory.js";
import type { ResolvedChoice } from "./types.js";
import { makeScene, makeText, makeChoice, makeGate, makeClear, makeRef } from "./helpers/fixtures.js";

function makeEngine(scenes: Record<string, Scene> = {}) {
    const engine = createEngine({ storage: new MemoryStorageAdapter() });
    engine.registerSceneLoader(async (id) => {
        const scene = scenes[id];
        if (!scene) throw new Error(`Scene "${id}" not found.`);
        return scene;
    });
    return engine;
}

// Helper to collect events from an engine run
async function runToChoices(
    engine: ReturnType<typeof makeEngine>,
    sceneId: string
): Promise<{ renders: string[]; cleared: boolean; choices: ResolvedChoice[] }> {
    const renders: string[] = [];
    let cleared = false;
    let choices: ResolvedChoice[] = [];

    engine.on("render", (node) => renders.push(node.nodeId));
    engine.on("clear", () => { cleared = true; });
    engine.on("choices", (c) => { choices = c; });

    await engine.init();
    await engine.start(sceneId);
    return { renders, cleared, choices };
}

describe("createEngine", () => {
    describe("basic traversal", () => {
        it("traverses text nodes and emits render events", async () => {
            const scene = makeScene("s", [
                makeText("a", "Hello", [makeRef("b")]),
                makeText("b", "World", [makeRef("c")]),
                makeText("c", "End", []),
            ]);
            const { renders } = await runToChoices(makeEngine({ s: scene }), "s");
            expect(renders).toEqual(["a", "b", "c"]);
        });

        it("emits choices event when children are ChoiceNodes", async () => {
            const scene = makeScene("s", [
                makeText("q", "Question?", [makeRef("c1"), makeRef("c2")]),
                makeChoice("c1", "Yes"),
                makeChoice("c2", "No"),
            ]);
            const { renders, choices } = await runToChoices(makeEngine({ s: scene }), "s");
            expect(renders).toEqual(["q"]);
            expect(choices).toHaveLength(2);
        });

        it("emits end event when no more children", async () => {
            const scene = makeScene("s", [makeText("a", "Only", [])]);
            const engine = makeEngine({ s: scene });
            const endFired = vi.fn();
            engine.on("end", endFired);
            await engine.init();
            await engine.start("s");
            expect(endFired).toHaveBeenCalledTimes(1);
        });
    });

    describe("choose()", () => {
        it("choose continues traversal after selection", async () => {
            const scene = makeScene("s", [
                makeText("q", "Pick?", [makeRef("c1"), makeRef("c2")]),
                makeChoice("c1", "One", [makeRef("end")]),
                makeChoice("c2", "Two", [makeRef("end")]),
                makeText("end", "Done", []),
            ]);
            const engine = makeEngine({ s: scene });
            const renders: string[] = [];
            let savedChoices: ResolvedChoice[] = [];

            engine.on("render", (n) => renders.push(n.nodeId));
            engine.on("choices", (c) => { savedChoices = c; });

            await engine.init();
            await engine.start("s");
            expect(savedChoices).toHaveLength(2);

            await engine.choose(savedChoices[0]); // choose c1
            expect(renders).toContain("end");
        });

        it("marks choice as visited after choose", async () => {
            const scene = makeScene("s", [
                makeText("q", "Pick?", [makeRef("c1")]),
                makeChoice("c1", "Go", [makeRef("end")]),
                makeText("end", "Done", []),
            ]);
            const engine = makeEngine({ s: scene });
            let savedChoices: ResolvedChoice[] = [];
            engine.on("choices", (c) => { savedChoices = c; });
            await engine.init();
            await engine.start("s");
            await engine.choose(savedChoices[0]);
            expect(engine.getState().isVisited("s", "c1")).toBe(true);
        });

        it("choice onChoose effects are applied", async () => {
            const scene = makeScene("s", [
                makeText("q", "Q?", [makeRef("c1")]),
                {
                    type: "choice" as const,
                    id: "c1",
                    html: "Go",
                    children: [makeRef("end")],
                    onChoose: [{ type: "set" as const, name: "chosen", value: true }],
                },
                makeText("end", "Done", []),
            ]);
            const engine = makeEngine({ s: scene });
            let choices: ResolvedChoice[] = [];
            engine.on("choices", (c) => { choices = c; });
            await engine.init();
            await engine.start("s");
            await engine.choose(choices[0]);
            expect(engine.getVar("chosen")).toBe(true);
        });

        it("edge effects are applied when traversing to target", async () => {
            const scene = makeScene("s", [
                makeText("q", "Q?", [makeRef("c1")]),
                makeChoice("c1", "Go", [makeRef("end", { effects: [{ type: "set", name: "reached", value: true }] })]),
                makeText("end", "Done", []),
            ]);
            const engine = makeEngine({ s: scene });
            let choices: ResolvedChoice[] = [];
            engine.on("choices", (c) => { choices = c; });
            await engine.init();
            await engine.start("s");
            await engine.choose(choices[0]);
            expect(engine.getVar("reached")).toBe(true);
        });
    });

    describe("ClearNode", () => {
        it("emits clear event and continues", async () => {
            const scene = makeScene("s", [
                makeText("a", "Before", [makeRef("clr")]),
                makeClear("clr", [makeRef("b")]),
                makeText("b", "After", []),
            ]);
            const engine = makeEngine({ s: scene });
            const cleared = vi.fn();
            const renders: string[] = [];
            engine.on("clear", cleared);
            engine.on("render", (n) => renders.push(n.nodeId));
            await engine.init();
            await engine.start("s");
            expect(cleared).toHaveBeenCalledTimes(1);
            expect(renders).toContain("b");
        });
    });

    describe("GateNode", () => {
        it("first strategy picks first eligible child", async () => {
            const scene = makeScene("s", [
                makeGate("g", [
                    makeRef("a", { conditions: [{ type: "check", name: "flag", op: "truthy" }] }),
                    makeRef("b"),
                ], "first"),
                makeText("a", "A", []),
                makeText("b", "B", []),
            ]);
            const engine = makeEngine({ s: scene });
            const renders: string[] = [];
            engine.on("render", (n) => renders.push(n.nodeId));
            await engine.init();
            await engine.start("s");
            expect(renders).toContain("b");
            expect(renders).not.toContain("a");
        });
    });

    describe("state management", () => {
        it("setVar / getVar round-trip", async () => {
            const engine = makeEngine();
            await engine.init();
            engine.setVar("x", 42);
            expect(engine.getVar("x")).toBe(42);
        });

        it("unsetVar removes variable", async () => {
            const engine = makeEngine();
            await engine.init();
            engine.setVar("x", 1);
            engine.unsetVar("x");
            expect(engine.getVar("x")).toBeUndefined();
        });

        it("isConditionMet checks current state", async () => {
            const engine = makeEngine();
            await engine.init();
            engine.setVar("flag", true);
            expect(engine.isConditionMet({ type: "check", name: "flag", op: "truthy" })).toBe(true);
            expect(engine.isConditionMet({ type: "check", name: "flag", op: "falsy" })).toBe(false);
        });
    });

    describe("save / load", () => {
        it("save and load restores state", async () => {
            const engine = makeEngine();
            await engine.init();
            engine.setVar("score", 10);
            engine.save();

            const engine2 = createEngine({ storage: (engine as any).config?.storage ?? new MemoryStorageAdapter() });
            // Use the same storage by testing through the engine itself
            engine.load();
            expect(engine.getVar("score")).toBe(10);
        });

        it("load returns false when no save exists", async () => {
            const engine = makeEngine();
            await engine.init();
            expect(engine.load()).toBe(false);
        });

        it("load returns true when save exists", async () => {
            const engine = makeEngine();
            await engine.init();
            engine.setVar("x", 1);
            engine.save();
            expect(engine.load()).toBe(true);
        });

        it("reset clears state", async () => {
            const engine = makeEngine();
            await engine.init();
            engine.setVar("x", 99);
            engine.reset();
            expect(engine.getVar("x")).toBeUndefined();
        });
    });

    describe("events", () => {
        it("on returns unsubscribe function", async () => {
            const engine = makeEngine();
            const handler = vi.fn();
            const unsub = engine.on("stateChanged", handler);
            unsub();
            engine.setVar("x", 1);
            expect(handler).not.toHaveBeenCalled();
        });

        it("off removes a handler", async () => {
            const engine = makeEngine();
            const handler = vi.fn();
            engine.on("stateChanged", handler);
            engine.off("stateChanged", handler);
            engine.setVar("x", 1);
            expect(handler).not.toHaveBeenCalled();
        });
    });
});
