import { describe, it, expect } from "vitest";
import { GameState, isTruthy, evaluateCondition, applyEffect } from "./state.js";

describe("isTruthy", () => {
    it("undefined → false", () => expect(isTruthy(undefined)).toBe(false));
    it("false → false",     () => expect(isTruthy(false)).toBe(false));
    it("0 → false",         () => expect(isTruthy(0)).toBe(false));
    it("empty string → false", () => expect(isTruthy("")).toBe(false));
    it("true → true",       () => expect(isTruthy(true)).toBe(true));
    it("1 → true",          () => expect(isTruthy(1)).toBe(true));
    it("non-empty string → true", () => expect(isTruthy("hello")).toBe(true));
});

describe("evaluateCondition", () => {
    const state = (vars: Record<string, any>) => new Map(Object.entries(vars));

    describe("check truthy", () => {
        it("present truthy value → true",  () => expect(evaluateCondition({ type: "check", name: "x", op: "truthy" }, state({ x: true }))).toBe(true));
        it("absent value → false",         () => expect(evaluateCondition({ type: "check", name: "x", op: "truthy" }, state({}))).toBe(false));
        it("falsy value → false",          () => expect(evaluateCondition({ type: "check", name: "x", op: "truthy" }, state({ x: false }))).toBe(false));
    });

    describe("check falsy", () => {
        it("absent → true",                () => expect(evaluateCondition({ type: "check", name: "x", op: "falsy" }, state({}))).toBe(true));
        it("falsy value → true",           () => expect(evaluateCondition({ type: "check", name: "x", op: "falsy" }, state({ x: false }))).toBe(true));
        it("truthy value → false",         () => expect(evaluateCondition({ type: "check", name: "x", op: "falsy" }, state({ x: 1 }))).toBe(false));
    });

    describe("compare operators", () => {
        it("== match",  () => expect(evaluateCondition({ type: "compare", name: "x", op: "==", value: 5 }, state({ x: 5 }))).toBe(true));
        it("== no match", () => expect(evaluateCondition({ type: "compare", name: "x", op: "==", value: 5 }, state({ x: 4 }))).toBe(false));
        it("!= match",  () => expect(evaluateCondition({ type: "compare", name: "x", op: "!=", value: 5 }, state({ x: 3 }))).toBe(true));
        it("> match",   () => expect(evaluateCondition({ type: "compare", name: "x", op: ">",  value: 3 }, state({ x: 5 }))).toBe(true));
        it("> no match",() => expect(evaluateCondition({ type: "compare", name: "x", op: ">",  value: 5 }, state({ x: 5 }))).toBe(false));
        it(">= match",  () => expect(evaluateCondition({ type: "compare", name: "x", op: ">=", value: 5 }, state({ x: 5 }))).toBe(true));
        it("< match",   () => expect(evaluateCondition({ type: "compare", name: "x", op: "<",  value: 5 }, state({ x: 3 }))).toBe(true));
        it("<= match",  () => expect(evaluateCondition({ type: "compare", name: "x", op: "<=", value: 5 }, state({ x: 5 }))).toBe(true));
        it("undefined value → false", () => expect(evaluateCondition({ type: "compare", name: "x", op: "==", value: 1 }, state({}))).toBe(false));
        it("string equality", () => expect(evaluateCondition({ type: "compare", name: "job", op: "==", value: "poet" }, state({ job: "poet" }))).toBe(true));
    });
});

describe("applyEffect", () => {
    it("set", () => {
        const m = new Map<string, any>();
        applyEffect({ type: "set", name: "x", value: 42 }, m);
        expect(m.get("x")).toBe(42);
    });

    it("unset", () => {
        const m = new Map<string, any>([["x", 1]]);
        applyEffect({ type: "unset", name: "x" }, m);
        expect(m.has("x")).toBe(false);
    });

    it("toggle true → false", () => {
        const m = new Map<string, any>([["x", true]]);
        applyEffect({ type: "toggle", name: "x" }, m);
        expect(m.get("x")).toBe(false);
    });

    it("toggle false → true", () => {
        const m = new Map<string, any>([["x", false]]);
        applyEffect({ type: "toggle", name: "x" }, m);
        expect(m.get("x")).toBe(true);
    });

    it("increment from 0", () => {
        const m = new Map<string, any>();
        applyEffect({ type: "increment", name: "x", by: 3 }, m);
        expect(m.get("x")).toBe(3);
    });

    it("increment existing", () => {
        const m = new Map<string, any>([["x", 5]]);
        applyEffect({ type: "increment", name: "x", by: 2 }, m);
        expect(m.get("x")).toBe(7);
    });

    it("decrement", () => {
        const m = new Map<string, any>([["x", 5]]);
        applyEffect({ type: "increment", name: "x", by: -2 }, m);
        expect(m.get("x")).toBe(3);
    });
});

describe("GameState", () => {
    it("evaluateConditions: all must pass", () => {
        const gs = new GameState();
        gs.state.set("a", true);
        gs.state.set("b", 5);
        const result = gs.evaluateConditions([
            { type: "check", name: "a", op: "truthy" },
            { type: "compare", name: "b", op: ">", value: 3 },
        ]);
        expect(result).toBe(true);
    });

    it("evaluateConditions: one failing condition → false", () => {
        const gs = new GameState();
        gs.state.set("a", true);
        const result = gs.evaluateConditions([
            { type: "check", name: "a", op: "truthy" },
            { type: "check", name: "b", op: "truthy" }, // b not set → false
        ]);
        expect(result).toBe(false);
    });

    it("evaluateConditions: empty conditions → true", () => {
        const gs = new GameState();
        expect(gs.evaluateConditions([])).toBe(true);
    });

    it("markVisited writes to state map and visitedChoices", () => {
        const gs = new GameState();
        gs.markVisited("scene1", "node1");
        expect(gs.state.get("visited:scene1:node1")).toBe(true);
        expect(gs.visitedChoices["scene1"]).toContain("node1");
    });

    it("isVisited returns true after markVisited", () => {
        const gs = new GameState();
        gs.markVisited("s", "n");
        expect(gs.isVisited("s", "n")).toBe(true);
    });

    it("isVisited returns false before markVisited", () => {
        const gs = new GameState();
        expect(gs.isVisited("s", "n")).toBe(false);
    });

    it("serialize / deserialize round-trip", () => {
        const gs = new GameState();
        gs.state.set("x", 42);
        gs.markVisited("scene1", "nodeA");
        gs.scenePath.push({ sceneId: "outer", nodeId: "portal" });
        gs.choicesSinceClear.push({ sceneId: "scene1", nodeId: "choiceA" });
        gs.lastClearPosition = { sceneId: "scene1", nodeId: "clearNode" };

        const data = gs.serialize();
        const restored = GameState.deserialize(data);

        expect(restored.state.get("x")).toBe(42);
        expect(restored.isVisited("scene1", "nodeA")).toBe(true);
        expect(restored.scenePath).toEqual([{ sceneId: "outer", nodeId: "portal" }]);
        expect(restored.choicesSinceClear).toEqual([{ sceneId: "scene1", nodeId: "choiceA" }]);
        expect(restored.lastClearPosition).toEqual({ sceneId: "scene1", nodeId: "clearNode" });
    });

    it("clone produces an independent copy", () => {
        const gs = new GameState();
        gs.state.set("x", 1);
        const clone = gs.clone();
        clone.state.set("x", 99);
        expect(gs.state.get("x")).toBe(1);
    });

    it("reset clears all fields", () => {
        const gs = new GameState();
        gs.state.set("x", 1);
        gs.scenePath.push({ sceneId: "s", nodeId: "n" });
        gs.reset();
        expect(gs.state.size).toBe(0);
        expect(gs.scenePath).toHaveLength(0);
    });
});
