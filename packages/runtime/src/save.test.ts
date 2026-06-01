import { describe, it, expect } from "vitest";
import { SaveManager } from "./save.js";
import { GameState } from "./state.js";
import { MemoryStorageAdapter } from "./adapters/memory.js";

function makeManager() {
    return new SaveManager(new MemoryStorageAdapter(), "understory");
}

function makeState() {
    const gs = new GameState();
    gs.state.set("x", 42);
    gs.markVisited("scene1", "nodeA");
    return gs;
}

describe("SaveManager", () => {
    it("save and load round-trip (default slot)", () => {
        const mgr = makeManager();
        const gs = makeState();
        mgr.save(gs);
        const loaded = mgr.load();
        expect(loaded).not.toBeNull();
        expect(loaded!.state.get("x")).toBe(42);
        expect(loaded!.isVisited("scene1", "nodeA")).toBe(true);
    });

    it("load returns null when no save exists", () => {
        const mgr = makeManager();
        expect(mgr.load()).toBeNull();
    });

    it("saves to named slots", () => {
        const mgr = makeManager();
        const gs = makeState();
        mgr.save(gs, "slot1");
        expect(mgr.load("slot1")).not.toBeNull();
        expect(mgr.load()).toBeNull(); // default slot untouched
    });

    it("named slots are independent", () => {
        const mgr = makeManager();
        const gs1 = new GameState();
        gs1.state.set("x", 1);
        const gs2 = new GameState();
        gs2.state.set("x", 2);

        mgr.save(gs1, "a");
        mgr.save(gs2, "b");

        expect(mgr.load("a")!.state.get("x")).toBe(1);
        expect(mgr.load("b")!.state.get("x")).toBe(2);
    });

    it("listSaves includes default slot when saved", () => {
        const mgr = makeManager();
        mgr.save(makeState());
        expect(mgr.listSaves()).toContain("default");
    });

    it("listSaves includes named slots via recordSlot", () => {
        const mgr = makeManager();
        mgr.save(makeState(), "chapter1");
        mgr.recordSlot("chapter1");
        expect(mgr.listSaves()).toContain("chapter1");
    });

    it("handles corrupted data gracefully", () => {
        const storage = new MemoryStorageAdapter();
        storage.set("understory:save", "not json");
        const mgr = new SaveManager(storage, "understory");
        expect(mgr.load()).toBeNull();
    });

    it("rejects save data with wrong version", () => {
        const storage = new MemoryStorageAdapter();
        storage.set("understory:save", JSON.stringify({ version: 99 }));
        const mgr = new SaveManager(storage, "understory");
        expect(mgr.load()).toBeNull();
    });
});
