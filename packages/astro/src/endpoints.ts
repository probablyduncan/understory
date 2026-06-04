import type { Scene } from "@probablyduncan/understory-core";
import type { LoadedScene } from "./loader.js";

export function buildSceneEndpoints(scenes: LoadedScene[]): Map<string, Scene> {
    const result = new Map<string, Scene>();
    for (const { id, scene } of scenes) {
        if (scene !== null) {
            result.set(id, scene);
        }
    }
    return result;
}

export function buildScenesVirtualModuleCode(sceneMap: Map<string, Scene>): string {
    return `export const scenes = new Map(${JSON.stringify([...sceneMap.entries()])});`;
}
