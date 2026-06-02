import type { Parser, ParserOptions, ParseResult } from "../index.js";
import { ParseError } from "../index.js";
import { tokenize } from "./tokenizer.js";
import { buildScene } from "./nodeBuilder.js";

export class MermaidFlowchartParser implements Parser {
    extensions = [".mmd"];

    parseScene(id: string, content: string, options?: ParserOptions): ParseResult {
        try {
            const { vertices, edges, layout } = tokenize(content);
            const scene = buildScene(id, vertices, edges, layout, options);
            return { scene, issues: [] };
        } catch (e) {
            if (e instanceof ParseError) {
                return {
                    scene: null,
                    issues: [{ severity: "error", code: "parse_error", message: e.rawMessage, line: e.line }],
                };
            }
            throw e;
        }
    }
}
