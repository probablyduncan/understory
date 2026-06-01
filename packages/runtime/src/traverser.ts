import type { Scene, ChildRef, StoryNode, ChoiceNode } from "@probablyduncan/understory-core";
import type { TraversalResult, ResolvedChoice, NodePosition } from "./types.js";
import type { GameState } from "./state.js";

/**
 * Pure traversal function. Given a set of outgoing edges (ChildRef[]), evaluates conditions,
 * follows gate nodes, and returns the next TraversalResult.
 *
 * Does NOT handle ClearNode — the engine loop detects and emits clear before calling resolveNext.
 * Does NOT mutate state — the engine applies ChildRef.effects after receiving each result.
 *
 * Limitation: effects on gate-to-gate edges are not visible during condition evaluation
 * within the same resolveNext call (accepted v1 limitation).
 */
export function resolveNext(
    children: ChildRef[],
    scene: Scene,
    state: GameState,
    sceneId: string
): TraversalResult {
    const eligible = children.filter(
        (c) => !c.conditions?.length || state.evaluateConditions(c.conditions)
    );

    if (eligible.length === 0) {
        return { type: "end" };
    }

    const choiceRefs = eligible.filter((c) => scene.nodes[c.nodeId]?.type === "choice");

    if (choiceRefs.length > 0) {
        const choices: ResolvedChoice[] = choiceRefs.map((ref) => {
            const node = scene.nodes[ref.nodeId] as ChoiceNode;
            return {
                ...node,
                ...ref,
                sceneId,
                visited: state.isVisited(sceneId, ref.nodeId),
                enabled: true,
            };
        });
        return { type: "choices", choices };
    }

    const ref = selectNonChoice(eligible, scene, state);
    if (!ref) return { type: "end" };

    const targetNode = scene.nodes[ref.nodeId];
    if (!targetNode) return { type: "end" };

    const position: NodePosition = { sceneId, nodeId: ref.nodeId };

    if (targetNode.type === "gate") {
        if (targetNode.id.startsWith("return") || targetNode.children.length === 0) {
            // return gate or dead gate → signal end (engine pops scene stack)
            return { type: "end" };
        }

        const gateChildren = targetNode.strategy === "random"
            ? pickRandom(targetNode.children, state)
            : targetNode.children;

        // Recurse through the gate, propagating the incoming ChildRef's delay/conditions
        // onto the final result so the engine can apply effects correctly
        return resolveNext(gateChildren, scene, state, sceneId);
    }

    // text, image, custom, scene, choice (already filtered), clear (engine handles)
    return {
        type: "render",
        node: { ...targetNode, ...ref, ...position } as StoryNode & ChildRef & NodePosition,
    };
}

function selectNonChoice(
    eligible: ChildRef[],
    scene: Scene,
    state: GameState
): ChildRef | undefined {
    const nonChoice = eligible.filter((c) => scene.nodes[c.nodeId]?.type !== "choice");
    if (nonChoice.length === 0) return undefined;
    // "first" strategy for non-gate selection (gates apply their own strategy internally)
    return nonChoice[0];
}

function pickRandom(children: ChildRef[], state: GameState): ChildRef[] {
    const eligible = children.filter(
        (c) => !c.conditions?.length || state.evaluateConditions(c.conditions)
    );
    if (eligible.length === 0) return [];
    return [eligible[Math.floor(Math.random() * eligible.length)]];
}
