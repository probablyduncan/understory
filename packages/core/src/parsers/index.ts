import type { Scene } from "../types.js";

export type { Scene };

export type ParserOptions = {
    /** Map of asset names to their types. Node text matching a key overrides shape-based type resolution. */
    assets?: Map<string, "image" | "custom" | "scene">;
};

export interface Parser {
    extensions: string[];
    parse(content: string, id: string, options?: ParserOptions): Scene;
}

export class ParseError extends Error {
    line?: number;
    constructor(message: string, line?: number) {
        super(line !== undefined ? `line ${line}: ${message}` : message);
        this.name = "ParseError";
        this.line = line;
    }
}

export { MermaidParser } from "./mermaid-flowchart/index.js";
