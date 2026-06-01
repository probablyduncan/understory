import type { Scene, StoryNode, ChildRef } from "@probablyduncan/understory-core";
import { GameState } from "../state.js";
import type { StateValue } from "../types.js";

type NodeSpec = StoryNode & { id: string };

export function makeScene(
    id: string,
    nodes: NodeSpec[],
    entryNodeId?: string
): Scene {
    const nodeMap: Record<string, StoryNode> = {};
    for (const node of nodes) {
        nodeMap[node.id] = node;
    }
    return {
        id,
        nodes: nodeMap,
        entryNodeId: entryNodeId ?? nodes[0]?.id ?? "start",
        vars: [],
    };
}

export function makeText(id: string, html: string, children: ChildRef[] = []): StoryNode {
    return { type: "text", id, html, children };
}

export function makeChoice(id: string, html: string, children: ChildRef[] = []): StoryNode {
    return { type: "choice", id, html, children };
}

export function makeGate(
    id: string,
    children: ChildRef[],
    strategy: "first" | "random" = "first"
): StoryNode {
    return { type: "gate", id, children, strategy };
}

export function makeClear(id: string, children: ChildRef[] = []): StoryNode {
    return { type: "clear", id, children };
}

export function makeRef(nodeId: string, overrides?: Partial<ChildRef>): ChildRef {
    return { nodeId, ...overrides };
}

export function makeState(vars?: Record<string, StateValue>): GameState {
    const gs = new GameState();
    if (vars) {
        for (const [k, v] of Object.entries(vars)) {
            gs.state.set(k, v);
        }
    }
    return gs;
}
