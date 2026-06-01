import type { StorageAdapter, UserConfig, ConfigStore } from "./types.js";

const HARDCODED_DEFAULTS: UserConfig = {
    displayMode: "stream",
    textSpeed: 1,
    theme: "system",
    reduceMotion: false,
    fontSize: "md",
};

export function createConfigStore(
    storage: StorageAdapter,
    storageKey: string,
    constructorDefaults?: Partial<UserConfig>
): ConfigStore {
    const base: UserConfig = { ...HARDCODED_DEFAULTS, ...constructorDefaults };
    let current: UserConfig = loadFromStorage(storage, storageKey, base);
    const subscribers = new Set<(config: UserConfig) => void>();

    function notify() {
        subscribers.forEach((h) => h(current));
    }

    return {
        get() {
            return { ...current };
        },

        set(partial) {
            current = { ...current, ...partial };
            storage.set(storageKey, JSON.stringify(current));
            notify();
        },

        reset() {
            current = { ...base };
            storage.remove(storageKey);
            notify();
        },

        subscribe(handler) {
            subscribers.add(handler);
            return () => subscribers.delete(handler);
        },
    };
}

function loadFromStorage(
    storage: StorageAdapter,
    key: string,
    base: UserConfig
): UserConfig {
    const raw = storage.get(key);
    if (!raw) return { ...base };
    try {
        const parsed = JSON.parse(raw) as Partial<UserConfig>;
        return { ...base, ...parsed };
    } catch {
        return { ...base };
    }
}
