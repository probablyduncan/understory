import type { Scene, ChildRef, StateCondition, StateValue } from "@probablyduncan/understory-core";
import type {
    EngineConfig,
    EngineEvents,
    NodePosition,
    ResolvedChoice,
    StoryEngine,
} from "./types.js";
import { GameState } from "./state.js";
import { resolveNext } from "./traverser.js";
import { SaveManager } from "./save.js";
import { EventBus } from "./events.js";

export function createEngine(config: EngineConfig): StoryEngine {
    return new Engine(config);
}

class Engine implements StoryEngine {
    private gameState = new GameState();
    private sceneCache = new Map<string, Scene>();
    private sceneLoader: ((id: string) => Promise<Scene>) | null = null;
    private eventBus = new EventBus<EngineEvents>();
    private saveManager: SaveManager;
    private prefix: string;
    private silent = false;

    constructor(config: EngineConfig) {
        this.prefix = config.storagePrefix ?? "understory";
        this.saveManager = new SaveManager(config.storage, this.prefix);
    }

    async init(): Promise<void> {
        // Reserved for future async initialization (e.g. loading persisted state)
    }

    destroy(): void {
        this.eventBus.clear();
        this.sceneCache.clear();
    }

    registerSceneLoader(loader: (id: string) => Promise<Scene>): void {
        this.sceneLoader = loader;
    }

    // --- Traversal ---

    async start(sceneId?: string): Promise<void> {
        if (!this.sceneLoader) throw new Error("No scene loader registered.");
        if (!sceneId) throw new Error("sceneId is required for start().");
        const scene = await this.fetchScene(sceneId);
        this.emit("enterScene", scene.id);
        await this.traverse(scene.entryNodeId, scene);
    }

    async choose(choice: ResolvedChoice): Promise<void> {
        const scene = this.sceneCache.get(choice.sceneId);
        if (!scene) throw new Error(`Scene "${choice.sceneId}" not in cache.`);

        if (choice.onChoose) this.gameState.applyEffects(choice.onChoose);
        this.gameState.markVisited(choice.sceneId, choice.nodeId);
        this.gameState.choicesSinceClear.push({ sceneId: choice.sceneId, nodeId: choice.nodeId });
        this.emit("stateChanged");

        if (choice.effects) this.gameState.applyEffects(choice.effects);

        await this.traverse(choice.nodeId, scene);
    }

    async goToNode(position: NodePosition): Promise<void> {
        const scene = await this.fetchScene(position.sceneId);
        await this.traverse(position.nodeId, scene);
    }

    // --- State ---

    getState(): GameState {
        return this.gameState;
    }

    isConditionMet(condition: StateCondition): boolean {
        return this.gameState.evaluateConditions([condition]);
    }

    getVar(name: string): StateValue | undefined {
        return this.gameState.state.get(name);
    }

    setVar(name: string, value: StateValue): void {
        this.gameState.state.set(name, value);
        this.emit("stateChanged");
    }

    unsetVar(name: string): void {
        this.gameState.state.delete(name);
        this.emit("stateChanged");
    }

    // --- Save / Load ---

    save(slot?: string): void {
        this.saveManager.save(this.gameState, slot);
        if (slot) this.saveManager.recordSlot(slot);
    }

    load(slot?: string): boolean {
        const loaded = this.saveManager.load(slot);
        if (!loaded) return false;
        this.gameState = loaded;
        this.emit("stateChanged");
        return true;
    }

    listSaves(): string[] {
        return this.saveManager.listSaves();
    }

    reset(): void {
        this.gameState.reset();
        this.sceneCache.clear();
        this.emit("stateChanged");
    }

    // --- Events ---

    on<K extends keyof EngineEvents>(event: K, handler: EngineEvents[K]): () => void {
        return this.eventBus.on(event, handler);
    }

    off<K extends keyof EngineEvents>(event: K, handler: EngineEvents[K]): void {
        this.eventBus.off(event, handler);
    }

    // --- Internal traversal ---

    private emit<K extends keyof EngineEvents>(event: K, ...args: Parameters<EngineEvents[K]>): void {
        if (!this.silent) this.eventBus.emit(event, ...args);
    }

    private async fetchScene(id: string): Promise<Scene> {
        if (this.sceneCache.has(id)) return this.sceneCache.get(id)!;
        if (!this.sceneLoader) throw new Error("No scene loader registered.");
        const scene = await this.sceneLoader(id);
        this.sceneCache.set(id, scene);
        return scene;
    }

    private async traverse(nodeId: string, scene: Scene): Promise<void> {
        const node = scene.nodes[nodeId];
        if (!node) {
            this.emit("error", new Error(`Node "${nodeId}" not found in scene "${scene.id}".`));
            return;
        }

        switch (node.type) {
            case "clear": {
                this.emit("clear");
                this.gameState.lastClearPosition = { sceneId: scene.id, nodeId };
                this.gameState.choicesSinceClear = [];
                await this.resolve(node.children, scene);
                break;
            }

            case "text":
            case "image":
            case "custom": {
                this.emit("render", { ...node, nodeId, sceneId: scene.id } as any);
                await this.resolve(node.children, scene);
                break;
            }

            case "gate": {
                await this.resolve(node.children, scene);
                break;
            }

            case "scene": {
                this.gameState.scenePath.push({ sceneId: scene.id, nodeId });
                const subScene = await this.fetchScene(node.sceneId);
                this.emit("enterScene", subScene.id);
                await this.traverse(subScene.entryNodeId, subScene);
                break;
            }

            case "choice": {
                this.emit("render", { ...node, nodeId, sceneId: scene.id } as any);
                await this.resolve(node.children, scene);
                break;
            }
        }
    }

    private async resolve(children: ChildRef[], scene: Scene): Promise<void> {
        const result = resolveNext(children, scene, this.gameState, scene.id);

        switch (result.type) {
            case "render": {
                if (result.node.effects) {
                    this.gameState.applyEffects(result.node.effects);
                    this.emit("stateChanged");
                }
                await this.traverse(result.node.nodeId, scene);
                break;
            }

            case "choices": {
                this.emit("choices", result.choices);
                // Engine pauses here — choose() resumes traversal
                break;
            }

            case "end": {
                await this.handleEnd(scene);
                break;
            }

            case "exit-scene": {
                await this.handleExitScene(result.returnTo, scene);
                break;
            }
        }
    }

    private async handleEnd(currentScene: Scene): Promise<void> {
        if (this.gameState.scenePath.length > 0) {
            const returnTo = this.gameState.scenePath.pop()!;
            this.emit("exitScene", returnTo);
            const parentScene = await this.fetchScene(returnTo.sceneId);
            const sceneNode = parentScene.nodes[returnTo.nodeId];
            if (sceneNode?.type === "scene" && sceneNode.children.length > 0) {
                const nextRef = sceneNode.children[0];
                if (nextRef.effects) this.gameState.applyEffects(nextRef.effects);
                await this.traverse(nextRef.nodeId, parentScene);
            } else {
                this.emit("end");
            }
        } else {
            this.emit("end");
        }
    }

    private async handleExitScene(returnTo: NodePosition, currentScene: Scene): Promise<void> {
        // exit-scene means: this resolved to a SceneNode — load the sub-scene
        const nodeAtReturn = currentScene.nodes[returnTo.nodeId];
        if (nodeAtReturn?.type === "scene") {
            // Already handled by traverse() "scene" case; shouldn't get here via resolveNext normally
            // But handle defensively: load the sub-scene
            this.gameState.scenePath.push(returnTo);
            const subScene = await this.fetchScene(nodeAtReturn.sceneId);
            this.emit("enterScene", subScene.id);
            await this.traverse(subScene.entryNodeId, subScene);
        } else {
            // Return gate resolved — pop the scene stack
            await this.handleEnd(currentScene);
        }
    }
}
