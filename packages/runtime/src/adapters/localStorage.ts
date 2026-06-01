import type { StorageAdapter } from "../types.js";

// Browser-only. Only use in environments with access to window.localStorage.
export class LocalStorageAdapter implements StorageAdapter {
    get(key: string): string | null {
        return window.localStorage.getItem(key);
    }

    set(key: string, value: string): void {
        window.localStorage.setItem(key, value);
    }

    remove(key: string): void {
        window.localStorage.removeItem(key);
    }
}
