import type { StateCondition, StateEffect, StateValue } from "../types.js";

export type ParsedStateExpression = {
    conditions: StateCondition[];
    effects: StateEffect[];
    once: boolean;
};

function inferValue(s: string): StateValue {
    if (s === "true") return true;
    if (s === "false") return false;
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
    return s;
}

type ConditionLeaf = { kind: "condition"; value: StateCondition };
type EffectLeaf = { kind: "effect"; value: StateEffect };
type OnceLeaf = { kind: "once" };
type Leaf = ConditionLeaf | EffectLeaf | OnceLeaf;

function classifyToken(text: string): Leaf {
    // Bare !
    if (text === "!") return { kind: "once" };

    // +name → set true
    if (text.startsWith("+")) {
        return { kind: "effect", value: { type: "set", name: text.slice(1).trim(), value: true } };
    }

    // -name (not digit after -) → unset
    if (text.startsWith("-") && text.length > 1 && !/^\d/.test(text[1])) {
        return { kind: "effect", value: { type: "unset", name: text.slice(1).trim() } };
    }

    // ~name → toggle
    if (text.startsWith("~")) {
        return { kind: "effect", value: { type: "toggle", name: text.slice(1).trim() } };
    }

    // name++ → increment by 1
    if (/\+\+$/.test(text)) {
        return { kind: "effect", value: { type: "increment", name: text.replace(/\s*\+\+$/, "").trim(), by: 1 } };
    }

    // name-- → decrement by 1
    if (/--$/.test(text)) {
        return { kind: "effect", value: { type: "increment", name: text.replace(/\s*--$/, "").trim(), by: -1 } };
    }

    // name += N
    const incMatch = text.match(/^(.+?)\s*\+=\s*(-?\d+(?:\.\d+)?)$/);
    if (incMatch) {
        return { kind: "effect", value: { type: "increment", name: incMatch[1].trim(), by: Number(incMatch[2]) } };
    }

    // name -= N
    const decMatch = text.match(/^(.+?)\s*-=\s*(-?\d+(?:\.\d+)?)$/);
    if (decMatch) {
        return { kind: "effect", value: { type: "increment", name: decMatch[1].trim(), by: -Number(decMatch[2]) } };
    }

    // name == value (check before single =)
    const eqMatch = text.match(/^(.+?)\s*==\s*(.+)$/);
    if (eqMatch) {
        return { kind: "condition", value: { type: "compare", name: eqMatch[1].trim(), op: "==", value: inferValue(eqMatch[2].trim()) } };
    }

    // name != value
    const neqMatch = text.match(/^(.+?)\s*!=\s*(.+)$/);
    if (neqMatch) {
        return { kind: "condition", value: { type: "compare", name: neqMatch[1].trim(), op: "!=", value: inferValue(neqMatch[2].trim()) } };
    }

    // name >= value
    const gteMatch = text.match(/^(.+?)\s*>=\s*(.+)$/);
    if (gteMatch) {
        return { kind: "condition", value: { type: "compare", name: gteMatch[1].trim(), op: ">=", value: inferValue(gteMatch[2].trim()) } };
    }

    // name <= value
    const lteMatch = text.match(/^(.+?)\s*<=\s*(.+)$/);
    if (lteMatch) {
        return { kind: "condition", value: { type: "compare", name: lteMatch[1].trim(), op: "<=", value: inferValue(lteMatch[2].trim()) } };
    }

    // name > value (after >=)
    const gtMatch = text.match(/^(.+?)\s*>\s*(.+)$/);
    if (gtMatch) {
        return { kind: "condition", value: { type: "compare", name: gtMatch[1].trim(), op: ">", value: inferValue(gtMatch[2].trim()) } };
    }

    // name < value (after <=)
    const ltMatch = text.match(/^(.+?)\s*<\s*(.+)$/);
    if (ltMatch) {
        return { kind: "condition", value: { type: "compare", name: ltMatch[1].trim(), op: "<", value: inferValue(ltMatch[2].trim()) } };
    }

    // name = value (single =, after all compound operators)
    const setMatch = text.match(/^(.+?)\s*=\s*(.+)$/);
    if (setMatch) {
        return { kind: "effect", value: { type: "set", name: setMatch[1].trim(), value: inferValue(setMatch[2].trim()) } };
    }

    // !name → falsy check
    if (text.startsWith("!")) {
        return { kind: "condition", value: { type: "check", name: text.slice(1).trim(), op: "falsy" } };
    }

    // bare name → truthy check
    return { kind: "condition", value: { type: "check", name: text.trim(), op: "truthy" } };
}

export function parseStateExpression(text: string): ParsedStateExpression {
    const trimmed = text.trim();
    if (!trimmed) return { conditions: [], effects: [], once: false };

    const conditions: StateCondition[] = [];
    const effects: StateEffect[] = [];
    let once = false;

    for (const raw of trimmed.split(",")) {
        const token = raw.trim();
        if (!token) continue;
        const leaf = classifyToken(token);
        if (leaf.kind === "condition") conditions.push(leaf.value);
        else if (leaf.kind === "effect") effects.push(leaf.value);
        else once = true;
    }

    return { conditions, effects, once };
}
