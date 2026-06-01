import { describe, it, expect } from "vitest";
import { resolveNext } from "./traverser.js";
import { makeScene, makeText, makeChoice, makeGate, makeRef, makeState } from "./helpers/fixtures.js";

describe("resolveNext", () => {
    describe("basic render", () => {
        it("returns render for a text node child", () => {
            const scene = makeScene("s", [
                makeText("a", "Hello"),
                makeText("b", "World"),
            ]);
            const state = makeState();
            const result = resolveNext([makeRef("b")], scene, state, "s");
            expect(result.type).toBe("render");
            if (result.type === "render") {
                expect(result.node.nodeId).toBe("b");
                expect(result.node.sceneId).toBe("s");
            }
        });

        it("returns end when no eligible children", () => {
            const scene = makeScene("s", [makeText("a", "Hello")]);
            const state = makeState();
            const result = resolveNext([], scene, state, "s");
            expect(result.type).toBe("end");
        });
    });

    describe("conditions", () => {
        it("filters out children with failing conditions", () => {
            const scene = makeScene("s", [
                makeText("a", "A"),
                makeText("b", "B"),
            ]);
            const state = makeState(); // flag not set
            const result = resolveNext([
                makeRef("a", { conditions: [{ type: "check", name: "flag", op: "truthy" }] }),
                makeRef("b"),
            ], scene, state, "s");
            expect(result.type).toBe("render");
            if (result.type === "render") expect(result.node.nodeId).toBe("b");
        });

        it("includes child when condition passes", () => {
            const scene = makeScene("s", [makeText("a", "A"), makeText("b", "B")]);
            const state = makeState({ flag: true });
            const result = resolveNext([
                makeRef("a", { conditions: [{ type: "check", name: "flag", op: "truthy" }] }),
            ], scene, state, "s");
            expect(result.type).toBe("render");
            if (result.type === "render") expect(result.node.nodeId).toBe("a");
        });

        it("multiple conditions: all must pass", () => {
            const scene = makeScene("s", [makeText("a", "A")]);
            const state = makeState({ x: true });
            // y is not set → second condition fails
            const result = resolveNext([
                makeRef("a", { conditions: [
                    { type: "check", name: "x", op: "truthy" },
                    { type: "check", name: "y", op: "truthy" },
                ] }),
            ], scene, state, "s");
            expect(result.type).toBe("end");
        });
    });

    describe("choices", () => {
        it("returns choices when children are ChoiceNodes", () => {
            const scene = makeScene("s", [
                makeText("q", "Pick one"),
                makeChoice("c1", "Option A"),
                makeChoice("c2", "Option B"),
            ]);
            const state = makeState();
            const result = resolveNext([makeRef("c1"), makeRef("c2")], scene, state, "s");
            expect(result.type).toBe("choices");
            if (result.type === "choices") {
                expect(result.choices).toHaveLength(2);
                expect(result.choices[0].nodeId).toBe("c1");
            }
        });

        it("choice visited flag reflects state", () => {
            const scene = makeScene("s", [makeChoice("c1", "A")]);
            const state = makeState({ "visited:s:c1": true });
            const result = resolveNext([makeRef("c1")], scene, state, "s");
            expect(result.type).toBe("choices");
            if (result.type === "choices") {
                expect(result.choices[0].visited).toBe(true);
            }
        });

        it("filters ineligible choices by condition", () => {
            const scene = makeScene("s", [
                makeChoice("c1", "A"),
                makeChoice("c2", "B"),
            ]);
            const state = makeState();
            const result = resolveNext([
                makeRef("c1", { conditions: [{ type: "check", name: "key", op: "truthy" }] }),
                makeRef("c2"),
            ], scene, state, "s");
            expect(result.type).toBe("choices");
            if (result.type === "choices") {
                expect(result.choices).toHaveLength(1);
                expect(result.choices[0].nodeId).toBe("c2");
            }
        });
    });

    describe("gate — first strategy", () => {
        it("follows gate and returns render for target", () => {
            const scene = makeScene("s", [
                makeText("a", "Start"),
                makeGate("g", [makeRef("a")], "first"),
            ]);
            const state = makeState();
            const result = resolveNext([makeRef("g")], scene, state, "s");
            expect(result.type).toBe("render");
            if (result.type === "render") expect(result.node.nodeId).toBe("a");
        });

        it("gate picks first eligible child", () => {
            const scene = makeScene("s", [
                makeText("a", "A"),
                makeText("b", "B"),
                makeGate("g", [
                    makeRef("a", { conditions: [{ type: "check", name: "flag", op: "truthy" }] }),
                    makeRef("b"),
                ], "first"),
            ]);
            const state = makeState(); // flag not set → a filtered, b selected
            const result = resolveNext([makeRef("g")], scene, state, "s");
            expect(result.type).toBe("render");
            if (result.type === "render") expect(result.node.nodeId).toBe("b");
        });

        it("return gate with no children → end", () => {
            const scene = makeScene("s", [
                makeGate("return", [], "first"),
            ]);
            const state = makeState();
            const result = resolveNext([makeRef("return")], scene, state, "s");
            expect(result.type).toBe("end");
        });

        it("return-prefixed gate → end", () => {
            const scene = makeScene("s", [makeGate("return_boss", [], "first")]);
            const state = makeState();
            const result = resolveNext([makeRef("return_boss")], scene, state, "s");
            expect(result.type).toBe("end");
        });
    });

    describe("gate — random strategy", () => {
        it("selects from eligible children only", () => {
            const scene = makeScene("s", [
                makeText("a", "A"),
                makeText("b", "B"),
                makeGate("g", [
                    makeRef("a", { conditions: [{ type: "check", name: "flag", op: "truthy" }] }),
                    makeRef("b"),
                ], "random"),
            ]);
            const state = makeState(); // only b eligible
            const result = resolveNext([makeRef("g")], scene, state, "s");
            expect(result.type).toBe("render");
            if (result.type === "render") expect(result.node.nodeId).toBe("b");
        });

        it("random with all eligible — result is one of the valid nodes", () => {
            const scene = makeScene("s", [
                makeText("a", "A"),
                makeText("b", "B"),
                makeText("c", "C"),
                makeGate("g", [makeRef("a"), makeRef("b"), makeRef("c")], "random"),
            ]);
            const state = makeState();
            const ids = new Set<string>();
            for (let i = 0; i < 50; i++) {
                const result = resolveNext([makeRef("g")], scene, state, "s");
                if (result.type === "render") ids.add(result.node.nodeId);
            }
            expect(ids.size).toBeGreaterThan(1); // shows it's actually random
            expect([...ids].every((id) => ["a", "b", "c"].includes(id))).toBe(true);
        });
    });

    describe("nested gates", () => {
        it("follows through two levels of first gates", () => {
            const scene = makeScene("s", [
                makeText("leaf", "Leaf"),
                makeGate("inner", [makeRef("leaf")], "first"),
                makeGate("outer", [makeRef("inner")], "first"),
            ]);
            const state = makeState();
            const result = resolveNext([makeRef("outer")], scene, state, "s");
            expect(result.type).toBe("render");
            if (result.type === "render") expect(result.node.nodeId).toBe("leaf");
        });
    });

    describe("childRef passthrough", () => {
        it("result node includes delay from ChildRef", () => {
            const scene = makeScene("s", [makeText("a", "A")]);
            const state = makeState();
            const result = resolveNext(
                [makeRef("a", { delay: { beats: 2, style: "dots" } })],
                scene,
                state,
                "s"
            );
            expect(result.type).toBe("render");
            if (result.type === "render") {
                expect(result.node.delay).toEqual({ beats: 2, style: "dots" });
            }
        });
    });
});
