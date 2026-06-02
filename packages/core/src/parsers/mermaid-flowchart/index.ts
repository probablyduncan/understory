import type { Scene } from "../../types.js";
import type { Parser, ParserOptions } from "../index.js";
import { tokenize } from "./tokenizer.js";
import { buildScene } from "./nodeBuilder.js";

export class MermaidFlowchartParser implements Parser {
    readonly extensions = [".mmd"];

    parse(id: string, content: string, options?: ParserOptions): Scene {
        const { vertices, edges, layout } = tokenize(content);
        return buildScene(id, vertices, edges, layout, options);
    }
}
