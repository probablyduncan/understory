import type {
    Scene,
    StoryNode,
    ChildRef,
    StateCondition,
    StateEffect,
    ChoiceNode,
} from "../../types.js";
import { ParseError } from "../index.js";
import type { ParserOptions } from "../index.js";
import type { VertexInfo, EdgeInfo } from "./tokenizer.js";
import { parseStateExpression } from "../stateExpression.js";

// --- Shape and stroke mappings (internal) ---

const SHAPE_NODE_TYPE: Record<string, { nodeType: "text" | "choice" | "gate"; style?: string; strategy?: "first" | "random" }> = {
    square:     { nodeType: "text" },
    subroutine: { nodeType: "text", style: "emphasis" },
    round:      { nodeType: "choice" },
    stadium:    { nodeType: "choice", style: "minor" },
    diamond:    { nodeType: "gate", strategy: "random" },
    none:       { nodeType: "gate", strategy: "first" },
};

function strokeToDelay(stroke: string, length: number): import("../../types.js").Delay | undefined {
    const beats = length - 1;
    if (stroke === "normal")    return { beats, style: "dots" };
    if (stroke === "thick")     return { beats, style: "pause" };
    if (stroke === "dotted")    return { beats, style: "fade" };
    return undefined; // invisible
}

// --- Scope prefixing ---

function prefixName(name: string, sceneId: string): string {
    if (name.includes(":")) return name;
    return `${sceneId}:${name}`;
}

function prefixCondition(cond: StateCondition, sceneId: string): StateCondition {
    return { ...cond, name: prefixName(cond.name, sceneId) };
}

function prefixEffect(eff: StateEffect, sceneId: string): StateEffect {
    return { ...eff, name: prefixName((eff as { name: string }).name, sceneId) };
}

// --- Inline markdown (bold, italic, code, links) ---

export function applyMarkdown(text: string): string {
    return text
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/_(.+?)_/g, "<em>$1</em>")
        .replace(/`(.+?)`/g, "<code>$1</code>")
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

// --- Reserved keyword detection ---

function classifyReservedId(id: string, shape: string): "begin" | "return" | "clear" | "reset" | null {
    if (shape !== "none") return null;
    if (id === "begin") return "begin";
    if (id === "reset") return "reset";
    if (id.startsWith("return")) return "return";
    if (id.startsWith("clear")) return "clear";
    return null;
}

// --- Node construction (shape/asset → StoryNode) ---

function buildNode(
    id: string,
    vertex: VertexInfo,
    options: ParserOptions | undefined,
): StoryNode {
    const reserved = classifyReservedId(id, vertex.shape);

    if (reserved) {
        switch (reserved) {
            case "return":
                return { type: "gate", id, children: [], strategy: "first" };
            case "clear":
                return { type: "clear", id, children: [] };
            case "reset":
                return { type: "custom", id, name: "reset", children: [] };
            case "begin":
                throw new ParseError(`Unexpected 'begin' reached node builder — should have been removed`);
        }
    }

    // Asset resolution: text content takes precedence over bracket shape
    if (vertex.text !== undefined) {
        if (options?.scenes?.has(vertex.text)) {
            return { type: "scene", id, sceneId: vertex.text, children: [] };
        }
        if (options?.images?.has(vertex.text)) {
            return { type: "image", id, src: vertex.text, alt: "", children: [] };
        }
        if (options?.custom?.has(vertex.text)) {
            return { type: "custom", id, name: vertex.text, children: [] };
        }
    }

    const shapeConfig = SHAPE_NODE_TYPE[vertex.shape];
    const html = applyMarkdown(vertex.text ?? "");

    switch (shapeConfig.nodeType) {
        case "text":
            return {
                type: "text",
                id,
                html,
                children: [],
                ...(shapeConfig.style ? { style: shapeConfig.style } : {}),
            };
        case "choice":
            return {
                type: "choice",
                id,
                html,
                children: [],
                ...(shapeConfig.style ? { style: shapeConfig.style } : {}),
            };
        case "gate":
            return { type: "gate", id, children: [], strategy: shapeConfig.strategy };
    }
}

// --- Main build function ---

export function buildScene(
    sceneId: string,
    vertices: Map<string, VertexInfo>,
    edges: EdgeInfo[],
    layout: string | undefined,
    options: ParserOptions | undefined,
): Scene {
    // Determine entry node from `begin` edge, then remove `begin` vertex
    let entryNodeId: string | undefined;
    const beginVertex = vertices.get("begin");
    if (beginVertex && beginVertex.shape === "none") {
        const beginEdge = edges.find((e) => e.sourceId === "begin");
        if (beginEdge) entryNodeId = beginEdge.targetId;
        vertices.delete("begin");
    }

    // Fall back to source of first non-begin edge
    if (!entryNodeId) {
        const firstEdge = edges.find((e) => e.sourceId !== "begin");
        entryNodeId = firstEdge?.sourceId;
    }

    if (!entryNodeId) {
        throw new ParseError(
            "Could not determine entry node. Add a 'begin --> firstNode' edge or at least one edge."
        );
    }

    // Pass 1: build all nodes (children: [] initially)
    const nodes: Record<string, StoryNode> = {};
    for (const [id, vertex] of vertices) {
        nodes[id] = buildNode(id, vertex, options);
    }

    // Pass 2: build ChildRefs and wire them to source nodes
    const edgesBySource = new Map<string, EdgeInfo[]>();
    for (const edge of edges) {
        if (edge.sourceId === "begin") continue;
        const list = edgesBySource.get(edge.sourceId) ?? [];
        list.push(edge);
        edgesBySource.set(edge.sourceId, list);
    }

    // Track which ChoiceNode IDs need repeat: "once" (from the ! shorthand)
    const pendingOnce = new Set<string>();

    for (const [sourceId, outEdges] of edgesBySource) {
        const children: ChildRef[] = [];

        for (const edge of outEdges) {
            const ref = buildChildRef(edge, sceneId, nodes, pendingOnce);
            children.push(ref);
        }

        if (nodes[sourceId]) {
            nodes[sourceId] = { ...nodes[sourceId], children };
        }
    }

    // Apply repeat: "once" to ChoiceNodes targeted by !
    for (const nodeId of pendingOnce) {
        const node = nodes[nodeId];
        if (node?.type === "choice") {
            nodes[nodeId] = { ...(node as ChoiceNode), repeat: "once" };
        }
    }

    const scene: Scene = {
        id: sceneId,
        nodes,
        entryNodeId,
        vars: collectVars(nodes),
    };

    if (layout) scene.layout = layout;

    return scene;
}

function buildChildRef(
    edge: EdgeInfo,
    sceneId: string,
    nodes: Record<string, StoryNode>,
    pendingOnce: Set<string>,
): ChildRef {
    const ref: ChildRef = { nodeId: edge.targetId };

    const delay = strokeToDelay(edge.stroke, edge.length);
    if (delay) ref.delay = delay;

    // Parse edge text
    if (edge.text !== undefined && edge.text !== "") {
        const parsed = parseStateExpression(edge.text);

        const conditions = parsed.conditions.map((c) => prefixCondition(c, sceneId));
        const effects = parsed.effects.map((e) => prefixEffect(e, sceneId));

        // ! shorthand: add visited: condition, mark target for repeat: "once"
        if (parsed.once) {
            const visitedKey = `visited:${sceneId}:${edge.targetId}`;
            conditions.push({ type: "check", name: visitedKey, op: "falsy" });
            pendingOnce.add(edge.targetId);
        }

        if (conditions.length > 0) ref.conditions = conditions;

        if (effects.length > 0) {
            const targetNode = nodes[edge.targetId];
            if (targetNode?.type === "choice") {
                // Effects fire when the choice is selected, not when edge is traversed
                const existing = (targetNode as ChoiceNode).onChoose ?? [];
                nodes[edge.targetId] = {
                    ...(targetNode as ChoiceNode),
                    onChoose: [...existing, ...effects],
                };
            } else {
                ref.effects = effects;
            }
        }
    }

    return ref;
}

function collectVars(nodes: Record<string, StoryNode>): string[] {
    const vars = new Set<string>();

    for (const node of Object.values(nodes)) {
        for (const child of node.children) {
            child.conditions?.forEach((c) => vars.add(c.name));
            child.effects?.forEach((e) => vars.add((e as { name: string }).name));
        }
        if (node.type === "choice" && node.onChoose) {
            node.onChoose.forEach((e) => vars.add((e as { name: string }).name));
        }
    }

    return [...vars].sort();
}
