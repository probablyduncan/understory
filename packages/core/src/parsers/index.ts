import type { Scene } from "../types.js";
import type { StoryIssue } from "./validation.js";

export type ParserOptions = {
    scenes?: Set<string>;
    images?: Set<string>;
    custom?: Set<string>;
};

export type ParseResult = {
    scene: Scene | null;
    readonly issues: readonly StoryIssue[];
};

export interface Parser {
    extensions: string[];
    parseScene(id: string, content: string, options?: ParserOptions): ParseResult;
}

export class ParseError extends Error {
    line?: number;
    rawMessage: string;
    constructor(message: string, line?: number) {
        super(line !== undefined ? `line ${line}: ${message}` : message);
        this.name = "ParseError";
        this.line = line;
        this.rawMessage = message;
    }
}

export { MermaidFlowchartParser } from "./mermaid-flowchart/index.js";
