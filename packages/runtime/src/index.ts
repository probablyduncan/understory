export { createEngine } from "./engine.js";
export { createConfigStore } from "./config.js";
export { resolveNext } from "./traverser.js";
export { GameState, isTruthy, evaluateCondition, applyEffect } from "./state.js";
export { MemoryStorageAdapter } from "./adapters/memory.js";
export { LocalStorageAdapter } from "./adapters/localStorage.js";

export type {
    StorageAdapter,
    NodePosition,
    ResolvedChoice,
    TraversalResult,
    EngineConfig,
    EngineEvents,
    UserConfig,
    ConfigStore,
    SaveData,
    StoryEngine,
    StateValue,
} from "./types.js";
