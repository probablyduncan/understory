import type { Scene } from "../types.js";

export type { Scene };

export type ParserOptions = {
    assets?: Map<string, "image" | "custom" | "scene">;
};

export interface Parser {
    extensions: string[];
    parse(id: string, content: string, options?: ParserOptions): Scene;
}

export class ParseError extends Error {
    line?: number;
    constructor(message: string, line?: number) {
        super(line !== undefined ? `line ${line}: ${message}` : message);
        this.name = "ParseError";
        this.line = line;
    }
}

export { MermaidFlowchartParser } from "./mermaid-flowchart/index.js";
