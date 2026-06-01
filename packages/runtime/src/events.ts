type AnyHandler = (...args: any[]) => void;

export class EventBus<Events extends Record<string, AnyHandler>> {
    private handlers = new Map<keyof Events, Set<AnyHandler>>();

    on<K extends keyof Events>(event: K, handler: Events[K]): () => void {
        let set = this.handlers.get(event);
        if (!set) {
            set = new Set();
            this.handlers.set(event, set);
        }
        set.add(handler);
        return () => this.off(event, handler);
    }

    off<K extends keyof Events>(event: K, handler: Events[K]): void {
        this.handlers.get(event)?.delete(handler);
    }

    once<K extends keyof Events>(event: K, handler: Events[K]): () => void {
        const wrapper = ((...args: Parameters<Events[K]>) => {
            this.off(event, wrapper as Events[K]);
            handler(...args);
        }) as Events[K];
        return this.on(event, wrapper);
    }

    emit<K extends keyof Events>(event: K, ...args: Parameters<Events[K]>): void {
        this.handlers.get(event)?.forEach((h) => h(...args));
    }

    clear(): void {
        this.handlers.clear();
    }
}
