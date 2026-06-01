import type { StorageAdapter, SaveData } from "./types.js";
import { GameState } from "./state.js";

export class SaveManager {
    constructor(
        private storage: StorageAdapter,
        private prefix: string
    ) {}

    private key(slot?: string): string {
        return slot ? `${this.prefix}:save:${slot}` : `${this.prefix}:save`;
    }

    save(state: GameState, slot?: string): void {
        const data = state.serialize();
        this.storage.set(this.key(slot), JSON.stringify(data));
    }

    load(slot?: string): GameState | null {
        const raw = this.storage.get(this.key(slot));
        if (!raw) return null;
        try {
            const data = JSON.parse(raw) as SaveData;
            if (data.version !== 1) return null;
            return GameState.deserialize(data);
        } catch {
            return null;
        }
    }

    listSaves(): string[] {
        const defaultKey = this.key();
        const prefix = `${this.prefix}:save:`;
        const slots: string[] = [];

        // Check default slot
        if (this.storage.get(defaultKey) !== null) {
            slots.push("default");
        }

        // MemoryStorageAdapter exposes iteration; localStorage doesn't have a direct list API.
        // For named slots, we rely on the engine tracking them, or a separate index key.
        // For v1: store a slot index in storage.
        const indexRaw = this.storage.get(`${this.prefix}:save-slots`);
        if (indexRaw) {
            try {
                const named = JSON.parse(indexRaw) as string[];
                slots.push(...named);
            } catch {}
        }

        return slots;
    }

    recordSlot(slot: string): void {
        const indexRaw = this.storage.get(`${this.prefix}:save-slots`);
        const existing: string[] = indexRaw ? (JSON.parse(indexRaw) as string[]) : [];
        if (!existing.includes(slot)) {
            existing.push(slot);
            this.storage.set(`${this.prefix}:save-slots`, JSON.stringify(existing));
        }
    }

    remove(slot?: string): void {
        this.storage.remove(this.key(slot));
    }
}
