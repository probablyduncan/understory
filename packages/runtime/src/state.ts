import type { StateCondition, StateEffect, StateValue } from "@probablyduncan/understory-core";
import type { NodePosition, SaveData } from "./types.js";

export function isTruthy(value: StateValue | undefined): boolean {
    return value !== undefined && value !== false && value !== 0 && value !== "";
}

export function evaluateCondition(
    cond: StateCondition,
    state: Map<string, StateValue>
): boolean {
    if (cond.type === "check") {
        const val = state.get(cond.name);
        return cond.op === "truthy" ? isTruthy(val) : !isTruthy(val);
    }
    const current = state.get(cond.name);
    if (current === undefined) return false;
    switch (cond.op) {
        case "==":  return current === cond.value;
        case "!=":  return current !== cond.value;
        case ">":   return (current as number) > (cond.value as number);
        case "<":   return (current as number) < (cond.value as number);
        case ">=":  return (current as number) >= (cond.value as number);
        case "<=":  return (current as number) <= (cond.value as number);
    }
}

export function applyEffect(effect: StateEffect, state: Map<string, StateValue>): void {
    switch (effect.type) {
        case "set":
            state.set(effect.name, effect.value);
            break;
        case "unset":
            state.delete(effect.name);
            break;
        case "toggle":
            state.set(effect.name, !state.get(effect.name));
            break;
        case "increment": {
            const n = (state.get(effect.name) as number) ?? 0;
            state.set(effect.name, n + effect.by);
            break;
        }
    }
}

export class GameState {
    state: Map<string, StateValue>;
    visitedChoices: Record<string, string[]>;
    scenePath: NodePosition[];
    choicesSinceClear: NodePosition[];
    lastClearPosition: NodePosition | null;

    constructor() {
        this.state = new Map();
        this.visitedChoices = {};
        this.scenePath = [];
        this.choicesSinceClear = [];
        this.lastClearPosition = null;
    }

    evaluateConditions(conditions: StateCondition[]): boolean {
        return conditions.every((c) => evaluateCondition(c, this.state));
    }

    applyEffect(effect: StateEffect): void {
        applyEffect(effect, this.state);
    }

    applyEffects(effects: StateEffect[]): void {
        effects.forEach((e) => this.applyEffect(e));
    }

    markVisited(sceneId: string, nodeId: string): void {
        const key = `visited:${sceneId}:${nodeId}`;
        this.state.set(key, true);
        if (!this.visitedChoices[sceneId]) this.visitedChoices[sceneId] = [];
        if (!this.visitedChoices[sceneId].includes(nodeId)) {
            this.visitedChoices[sceneId].push(nodeId);
        }
    }

    isVisited(sceneId: string, nodeId: string): boolean {
        return isTruthy(this.state.get(`visited:${sceneId}:${nodeId}`));
    }

    serialize(): SaveData {
        return {
            version: 1,
            state: Object.fromEntries(this.state),
            visitedChoices: { ...this.visitedChoices },
            scenePath: [...this.scenePath],
            lastClearPosition: this.lastClearPosition,
            choicesSinceClear: [...this.choicesSinceClear],
        };
    }

    static deserialize(data: SaveData): GameState {
        const gs = new GameState();
        gs.state = new Map(Object.entries(data.state));
        gs.visitedChoices = { ...data.visitedChoices };
        gs.scenePath = [...data.scenePath];
        gs.lastClearPosition = data.lastClearPosition;
        gs.choicesSinceClear = [...data.choicesSinceClear];
        return gs;
    }

    clone(): GameState {
        return GameState.deserialize(this.serialize());
    }

    reset(): void {
        this.state.clear();
        this.visitedChoices = {};
        this.scenePath = [];
        this.choicesSinceClear = [];
        this.lastClearPosition = null;
    }
}
