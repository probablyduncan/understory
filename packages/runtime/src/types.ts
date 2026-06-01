import type {
    StoryNode,
    ChoiceNode,
    ChildRef,
    StateValue,
} from "@probablyduncan/understory-core";

export type { StateValue };

export type StorageAdapter = {
    get(key: string): string | null;
    set(key: string, value: string): void;
    remove(key: string): void;
};

export type NodePosition = {
    sceneId: string;
    nodeId: string;
};

export type ResolvedChoice = ChoiceNode & ChildRef & NodePosition & {
    visited: boolean;
    enabled: boolean;
};

export type TraversalResult =
    | { type: "render"; node: StoryNode & ChildRef & NodePosition }
    | { type: "choices"; choices: ResolvedChoice[] }
    | { type: "end" }
    | { type: "exit-scene"; returnTo: NodePosition };

export type EngineConfig = {
    storage: StorageAdapter;
    storagePrefix?: string;
};

export type UserConfig = {
    displayMode: "stream" | "paged" | "instant";
    textSpeed: number;
    theme: "light" | "dark" | "system";
    reduceMotion: boolean;
    fontSize: "sm" | "md" | "lg";
};

export type SaveData = {
    version: 1;
    state: Record<string, StateValue>;
    visitedChoices: Record<string, string[]>;
    scenePath: NodePosition[];
    lastClearPosition: NodePosition | null;
    choicesSinceClear: NodePosition[];
};

export type EngineEvents = {
    render: (node: StoryNode & ChildRef & NodePosition) => void;
    choices: (choices: ResolvedChoice[]) => void;
    clear: () => void;
    enterScene: (sceneId: string) => void;
    exitScene: (returnTo: NodePosition) => void;
    stateChanged: () => void;
    end: () => void;
    error: (error: Error) => void;
};

export interface ConfigStore {
    get(): UserConfig;
    set(partial: Partial<UserConfig>): void;
    reset(): void;
    subscribe(handler: (config: UserConfig) => void): () => void;
}

export interface StoryEngine {
    init(): Promise<void>;
    destroy(): void;
    registerSceneLoader(loader: (id: string) => Promise<import("@probablyduncan/understory-core").Scene>): void;
    start(sceneId?: string): Promise<void>;
    choose(choice: ResolvedChoice): Promise<void>;
    goToNode(position: NodePosition): Promise<void>;
    getState(): import("./state.js").GameState;
    isConditionMet(condition: import("@probablyduncan/understory-core").StateCondition): boolean;
    getVar(name: string): StateValue | undefined;
    setVar(name: string, value: StateValue): void;
    unsetVar(name: string): void;
    save(slot?: string): void;
    load(slot?: string): boolean;
    listSaves(): string[];
    reset(): void;
    on<K extends keyof EngineEvents>(event: K, handler: EngineEvents[K]): () => void;
    off<K extends keyof EngineEvents>(event: K, handler: EngineEvents[K]): void;
}
