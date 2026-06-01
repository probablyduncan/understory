import { describe, it, expect, vi } from "vitest";
import { createConfigStore } from "./config.js";
import { MemoryStorageAdapter } from "./adapters/memory.js";

function makeStore(defaults?: any) {
    return createConfigStore(new MemoryStorageAdapter(), "understory:config", defaults);
}

describe("createConfigStore", () => {
    it("returns hardcoded defaults when no persisted value", () => {
        const store = makeStore();
        const config = store.get();
        expect(config.displayMode).toBe("stream");
        expect(config.textSpeed).toBe(1);
        expect(config.theme).toBe("system");
        expect(config.fontSize).toBe("md");
    });

    it("constructor defaults override hardcoded defaults", () => {
        const store = makeStore({ theme: "dark", textSpeed: 2 });
        expect(store.get().theme).toBe("dark");
        expect(store.get().textSpeed).toBe(2);
    });

    it("set merges partial update", () => {
        const store = makeStore();
        store.set({ theme: "dark" });
        expect(store.get().theme).toBe("dark");
        expect(store.get().displayMode).toBe("stream"); // unchanged
    });

    it("set persists to storage", () => {
        const storage = new MemoryStorageAdapter();
        const store = createConfigStore(storage, "understory:config");
        store.set({ theme: "dark" });
        expect(storage.get("understory:config")).not.toBeNull();
        const parsed = JSON.parse(storage.get("understory:config")!);
        expect(parsed.theme).toBe("dark");
    });

    it("loads persisted value on creation", () => {
        const storage = new MemoryStorageAdapter();
        storage.set("understory:config", JSON.stringify({ theme: "dark" }));
        const store = createConfigStore(storage, "understory:config");
        expect(store.get().theme).toBe("dark");
    });

    it("reset restores to base defaults and clears storage", () => {
        const storage = new MemoryStorageAdapter();
        const store = createConfigStore(storage, "understory:config", { theme: "light" });
        store.set({ theme: "dark" });
        store.reset();
        expect(store.get().theme).toBe("light"); // back to constructor default
        expect(storage.get("understory:config")).toBeNull();
    });

    it("subscribe fires on set", () => {
        const store = makeStore();
        const handler = vi.fn();
        store.subscribe(handler);
        store.set({ theme: "dark" });
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(expect.objectContaining({ theme: "dark" }));
    });

    it("subscribe fires on reset", () => {
        const store = makeStore();
        const handler = vi.fn();
        store.subscribe(handler);
        store.reset();
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it("subscribe returns unsubscribe function", () => {
        const store = makeStore();
        const handler = vi.fn();
        const unsub = store.subscribe(handler);
        unsub();
        store.set({ theme: "dark" });
        expect(handler).not.toHaveBeenCalled();
    });

    it("get returns a copy — mutations do not affect store", () => {
        const store = makeStore();
        const config = store.get();
        config.theme = "dark";
        expect(store.get().theme).toBe("system");
    });
});
