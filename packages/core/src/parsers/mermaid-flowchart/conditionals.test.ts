import { describe, it, expect } from "vitest";
import { parseConditionals } from "./conditionals.js";

describe("parseConditionals", () => {
    describe("empty / bare", () => {
        it("returns empty result for empty string", () => {
            expect(parseConditionals("")).toEqual({ conditions: [], effects: [], once: false });
        });

        it("returns empty result for whitespace", () => {
            expect(parseConditionals("  ")).toEqual({ conditions: [], effects: [], once: false });
        });

        it("bare ! sets once", () => {
            expect(parseConditionals("!")).toEqual({ conditions: [], effects: [], once: true });
        });
    });

    describe("truthy / falsy checks", () => {
        it("bare name → truthy check", () => {
            expect(parseConditionals("hasKey")).toEqual({
                conditions: [{ type: "check", name: "hasKey", op: "truthy" }],
                effects: [],
                once: false,
            });
        });

        it("!name → falsy check", () => {
            expect(parseConditionals("!hasKey")).toEqual({
                conditions: [{ type: "check", name: "hasKey", op: "falsy" }],
                effects: [],
                once: false,
            });
        });
    });

    describe("comparison conditions", () => {
        it("== string value", () => {
            expect(parseConditionals("profession == poet")).toEqual({
                conditions: [{ type: "compare", name: "profession", op: "==", value: "poet" }],
                effects: [],
                once: false,
            });
        });

        it("== boolean true", () => {
            expect(parseConditionals("hasKey == true")).toEqual({
                conditions: [{ type: "compare", name: "hasKey", op: "==", value: true }],
                effects: [],
                once: false,
            });
        });

        it("== boolean false", () => {
            expect(parseConditionals("hasKey == false")).toEqual({
                conditions: [{ type: "compare", name: "hasKey", op: "==", value: false }],
                effects: [],
                once: false,
            });
        });

        it("!= string value", () => {
            expect(parseConditionals("profession != merchant")).toEqual({
                conditions: [{ type: "compare", name: "profession", op: "!=", value: "merchant" }],
                effects: [],
                once: false,
            });
        });

        it("> number", () => {
            expect(parseConditionals("level > 5")).toEqual({
                conditions: [{ type: "compare", name: "level", op: ">", value: 5 }],
                effects: [],
                once: false,
            });
        });

        it(">= number", () => {
            expect(parseConditionals("level >= 10")).toEqual({
                conditions: [{ type: "compare", name: "level", op: ">=", value: 10 }],
                effects: [],
                once: false,
            });
        });

        it("< number", () => {
            expect(parseConditionals("level < 3")).toEqual({
                conditions: [{ type: "compare", name: "level", op: "<", value: 3 }],
                effects: [],
                once: false,
            });
        });

        it("<= number", () => {
            expect(parseConditionals("visits <= 2")).toEqual({
                conditions: [{ type: "compare", name: "visits", op: "<=", value: 2 }],
                effects: [],
                once: false,
            });
        });

        it("negative number value", () => {
            expect(parseConditionals("temp > -5")).toEqual({
                conditions: [{ type: "compare", name: "temp", op: ">", value: -5 }],
                effects: [],
                once: false,
            });
        });

        it("decimal number value", () => {
            expect(parseConditionals("ratio >= 0.5")).toEqual({
                conditions: [{ type: "compare", name: "ratio", op: ">=", value: 0.5 }],
                effects: [],
                once: false,
            });
        });
    });

    describe("effects", () => {
        it("+name → set true", () => {
            expect(parseConditionals("+hasKey")).toEqual({
                conditions: [],
                effects: [{ type: "set", name: "hasKey", value: true }],
                once: false,
            });
        });

        it("-name → unset", () => {
            expect(parseConditionals("-hasKey")).toEqual({
                conditions: [],
                effects: [{ type: "unset", name: "hasKey" }],
                once: false,
            });
        });

        it("~name → toggle", () => {
            expect(parseConditionals("~flag")).toEqual({
                conditions: [],
                effects: [{ type: "toggle", name: "flag" }],
                once: false,
            });
        });

        it("name = string → set", () => {
            expect(parseConditionals("profession = poet")).toEqual({
                conditions: [],
                effects: [{ type: "set", name: "profession", value: "poet" }],
                once: false,
            });
        });

        it("name = number → set", () => {
            expect(parseConditionals("level = 5")).toEqual({
                conditions: [],
                effects: [{ type: "set", name: "level", value: 5 }],
                once: false,
            });
        });

        it("name = true → set boolean", () => {
            expect(parseConditionals("hasKey = true")).toEqual({
                conditions: [],
                effects: [{ type: "set", name: "hasKey", value: true }],
                once: false,
            });
        });

        it("name++ → increment by 1", () => {
            expect(parseConditionals("level++")).toEqual({
                conditions: [],
                effects: [{ type: "increment", name: "level", by: 1 }],
                once: false,
            });
        });

        it("name-- → decrement by 1", () => {
            expect(parseConditionals("level--")).toEqual({
                conditions: [],
                effects: [{ type: "increment", name: "level", by: -1 }],
                once: false,
            });
        });

        it("name += N → increment by N", () => {
            expect(parseConditionals("level += 3")).toEqual({
                conditions: [],
                effects: [{ type: "increment", name: "level", by: 3 }],
                once: false,
            });
        });

        it("name -= N → decrement by N", () => {
            expect(parseConditionals("level -= 2")).toEqual({
                conditions: [],
                effects: [{ type: "increment", name: "level", by: -2 }],
                once: false,
            });
        });
    });

    describe("comma-separated list", () => {
        it("two conditions → flat list", () => {
            expect(parseConditionals("hasKey, level > 5")).toEqual({
                conditions: [
                    { type: "check", name: "hasKey", op: "truthy" },
                    { type: "compare", name: "level", op: ">", value: 5 },
                ],
                effects: [],
                once: false,
            });
        });

        it("three conditions → flat list", () => {
            const result = parseConditionals("a, b, c");
            expect(result.conditions).toEqual([
                { type: "check", name: "a", op: "truthy" },
                { type: "check", name: "b", op: "truthy" },
                { type: "check", name: "c", op: "truthy" },
            ]);
        });

        it("condition and effect mixed", () => {
            const result = parseConditionals("hasKey, +gold");
            expect(result.conditions).toEqual([{ type: "check", name: "hasKey", op: "truthy" }]);
            expect(result.effects).toEqual([{ type: "set", name: "gold", value: true }]);
        });

        it("multiple effects", () => {
            const result = parseConditionals("+enteredShop, level += 2");
            expect(result.conditions).toEqual([]);
            expect(result.effects).toEqual([
                { type: "set", name: "enteredShop", value: true },
                { type: "increment", name: "level", by: 2 },
            ]);
        });

        it("condition, effect, and once in same label", () => {
            const result = parseConditionals("hasKey, +gold, !");
            expect(result.conditions).toEqual([{ type: "check", name: "hasKey", op: "truthy" }]);
            expect(result.effects).toEqual([{ type: "set", name: "gold", value: true }]);
            expect(result.once).toBe(true);
        });
    });

    describe("! shorthand", () => {
        it("bare ! sets once, no conditions", () => {
            const result = parseConditionals("!");
            expect(result.once).toBe(true);
            expect(result.conditions).toEqual([]);
        });

        it("! with condition", () => {
            const result = parseConditionals("hasKey, !");
            expect(result.once).toBe(true);
            expect(result.conditions).toEqual([{ type: "check", name: "hasKey", op: "truthy" }]);
        });
    });

    describe("value type inference", () => {
        it("integer string → number", () => {
            const result = parseConditionals("x == 42");
            expect((result.conditions[0] as { value: unknown }).value).toBe(42);
        });

        it("float string → number", () => {
            const result = parseConditionals("x == 3.14");
            expect((result.conditions[0] as { value: unknown }).value).toBe(3.14);
        });

        it("true → boolean", () => {
            const result = parseConditionals("x == true");
            expect((result.conditions[0] as { value: unknown }).value).toBe(true);
        });

        it("false → boolean", () => {
            const result = parseConditionals("x == false");
            expect((result.conditions[0] as { value: unknown }).value).toBe(false);
        });

        it("other strings remain strings", () => {
            const result = parseConditionals("x == warrior");
            expect((result.conditions[0] as { value: unknown }).value).toBe("warrior");
        });
    });
});
