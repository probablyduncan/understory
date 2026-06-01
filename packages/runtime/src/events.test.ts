import { describe, it, expect, vi } from "vitest";
import { EventBus } from "./events.js";

type TestEvents = {
    foo: (x: number) => void;
    bar: (s: string) => void;
};

describe("EventBus", () => {
    it("calls registered handler on emit", () => {
        const bus = new EventBus<TestEvents>();
        const handler = vi.fn();
        bus.on("foo", handler);
        bus.emit("foo", 42);
        expect(handler).toHaveBeenCalledWith(42);
    });

    it("calls multiple handlers for the same event", () => {
        const bus = new EventBus<TestEvents>();
        const a = vi.fn();
        const b = vi.fn();
        bus.on("foo", a);
        bus.on("foo", b);
        bus.emit("foo", 1);
        expect(a).toHaveBeenCalledTimes(1);
        expect(b).toHaveBeenCalledTimes(1);
    });

    it("does not cross-contaminate different event types", () => {
        const bus = new EventBus<TestEvents>();
        const handler = vi.fn();
        bus.on("foo", handler);
        bus.emit("bar", "hello");
        expect(handler).not.toHaveBeenCalled();
    });

    it("off removes a specific handler", () => {
        const bus = new EventBus<TestEvents>();
        const handler = vi.fn();
        bus.on("foo", handler);
        bus.off("foo", handler);
        bus.emit("foo", 1);
        expect(handler).not.toHaveBeenCalled();
    });

    it("on returns an unsubscribe function", () => {
        const bus = new EventBus<TestEvents>();
        const handler = vi.fn();
        const unsub = bus.on("foo", handler);
        unsub();
        bus.emit("foo", 1);
        expect(handler).not.toHaveBeenCalled();
    });

    it("once fires exactly once", () => {
        const bus = new EventBus<TestEvents>();
        const handler = vi.fn();
        bus.once("foo", handler);
        bus.emit("foo", 1);
        bus.emit("foo", 2);
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(1);
    });

    it("once unsubscribe before firing prevents call", () => {
        const bus = new EventBus<TestEvents>();
        const handler = vi.fn();
        const unsub = bus.once("foo", handler);
        unsub();
        bus.emit("foo", 1);
        expect(handler).not.toHaveBeenCalled();
    });

    it("clear removes all handlers", () => {
        const bus = new EventBus<TestEvents>();
        const a = vi.fn();
        const b = vi.fn();
        bus.on("foo", a);
        bus.on("bar", b);
        bus.clear();
        bus.emit("foo", 1);
        bus.emit("bar", "x");
        expect(a).not.toHaveBeenCalled();
        expect(b).not.toHaveBeenCalled();
    });

    it("emitting with no handlers is a no-op", () => {
        const bus = new EventBus<TestEvents>();
        expect(() => bus.emit("foo", 1)).not.toThrow();
    });
});
