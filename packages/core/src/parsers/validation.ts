import type { Scene } from "../types.js";

export type StoryIssue = {
    severity: "error" | "warning";
    code: string;
    message: string;
    line?: number;
    nodeId?: string;
    sceneId?: string;
};

export type ValidationResult = {
    valid: boolean;
    issues: StoryIssue[];
};

function validateScene(scene: Scene): StoryIssue[] {
    const issues: StoryIssue[] = [];
    const { nodes, entryNodeId, id: sceneId } = scene;

    if (!nodes[entryNodeId]) {
        issues.push({
            severity: "error",
            code: "missing_entry_node",
            message: `entryNodeId "${entryNodeId}" does not exist in scene "${sceneId}"`,
            sceneId,
        });
    }

    for (const node of Object.values(nodes)) {
        for (const child of node.children) {
            if (!nodes[child.nodeId]) {
                issues.push({
                    severity: "error",
                    code: "missing_child_ref",
                    message: `Node "${node.id}" references non-existent node "${child.nodeId}"`,
                    nodeId: node.id,
                    sceneId,
                });
            }
        }
    }

    const reachable = new Set<string>();
    if (nodes[entryNodeId]) {
        const queue = [entryNodeId];
        while (queue.length > 0) {
            const id = queue.shift()!;
            if (reachable.has(id)) continue;
            reachable.add(id);
            for (const child of nodes[id].children) {
                if (!reachable.has(child.nodeId) && nodes[child.nodeId]) {
                    queue.push(child.nodeId);
                }
            }
        }
    }

    for (const id of Object.keys(nodes)) {
        if (!reachable.has(id)) {
            issues.push({
                severity: "warning",
                code: "unreachable_node",
                message: `Node "${id}" is unreachable from entry node "${entryNodeId}"`,
                nodeId: id,
                sceneId,
            });
        }
    }

    for (const node of Object.values(nodes)) {
        if (node.children.length === 0) {
            // Return gates with no eligible children are intentional scene exits
            if (node.type === "gate" && node.id.startsWith("return")) continue;
            issues.push({
                severity: "warning",
                code: "dead_end",
                message: `Node "${node.id}" has no children`,
                nodeId: node.id,
                sceneId,
            });
        }
    }

    return issues;
}

export function validateScenes(scenes: Scene | Scene[]): ValidationResult {
    const arr = Array.isArray(scenes) ? scenes : [scenes];
    const issues: StoryIssue[] = [];

    for (const scene of arr) {
        issues.push(...validateScene(scene));
    }

    const sceneIds = new Set(arr.map((s) => s.id));
    const referencedSceneIds = new Set<string>();

    for (const scene of arr) {
        for (const node of Object.values(scene.nodes)) {
            if (node.type === "scene") {
                referencedSceneIds.add(node.sceneId);
                if (!sceneIds.has(node.sceneId)) {
                    issues.push({
                        severity: "error",
                        code: "missing_scene_ref",
                        message: `Node "${node.id}" in scene "${scene.id}" references non-existent scene "${node.sceneId}"`,
                        nodeId: node.id,
                        sceneId: scene.id,
                    });
                }
            }
        }
    }

    if (arr.length > 1) {
        for (const scene of arr) {
            if (!referencedSceneIds.has(scene.id)) {
                issues.push({
                    severity: "warning",
                    code: "orphan_scene",
                    message: `Scene "${scene.id}" is not referenced by any other scene`,
                    sceneId: scene.id,
                });
            }
        }
    }

    return {
        valid: issues.every((i) => i.severity !== "error"),
        issues,
    };
}
