import { ParseError } from "../index.js";

export type VertexShape = "square" | "round" | "diamond" | "subroutine" | "stadium" | "none";
export type EdgeHead = "arrow" | "circle" | "cross" | "open";
export type EdgeStroke = "normal" | "thick" | "dotted" | "invisible";

export type VertexInfo = {
    id: string;
    text?: string;
    shape: VertexShape;
};

export type EdgeInfo = {
    sourceId: string;
    targetId: string;
    text?: string;
    head: EdgeHead;
    stroke: EdgeStroke;
    length: number;
};

export type TokenizerResult = {
    vertices: Map<string, VertexInfo>;
    edges: EdgeInfo[];
    layout?: string;
};

// Matches vertex specs: id, id[text], id(text), id{text}, id[[text]], id([text])
// IDs may contain word characters and periods (e.g. forest.mmd as a bare vertex ID).
// Order matters: longer bracket patterns before shorter ones.
const VERTEX_SPEC_RE =
    /^([\w.]+)(?:\[\[([^\]]*)\]\]|\(\[([^\]]*)\]\)|\[([^\]]*)\]|\(([^)]*)\)|\{([^}]*)\})?$/;

function parseVertexSpec(s: string): VertexInfo | null {
    const m = s.trim().match(VERTEX_SPEC_RE);
    if (!m) return null;

    const id = m[1];
    if (m[2] !== undefined) return { id, shape: "subroutine", text: m[2].trim() };
    if (m[3] !== undefined) return { id, shape: "stadium", text: m[3].trim() };
    if (m[4] !== undefined) return { id, shape: "square", text: m[4].trim() };
    if (m[5] !== undefined) return { id, shape: "round", text: m[5].trim() };
    if (m[6] !== undefined) return { id, shape: "diamond", text: m[6].trim() };
    return { id, shape: "none", text: undefined };
}

function parseArrowStr(s: string): { head: EdgeHead; stroke: EdgeStroke; length: number } | null {
    // Invisible: ~~~+
    const invisMatch = s.match(/^(~{3,})$/);
    if (invisMatch) {
        return { head: "open", stroke: "invisible", length: invisMatch[1].length - 2 };
    }

    // Dotted: -(\.+)-([>ox]?)
    const dottedMatch = s.match(/^-(\.+)-([>ox]?)$/);
    if (dottedMatch) {
        return {
            head: parseHead(dottedMatch[2]),
            stroke: "dotted",
            length: dottedMatch[1].length,
        };
    }

    // Thick: ={2,}([>ox]?)
    const thickMatch = s.match(/^(={2,})([>ox]?)$/);
    if (thickMatch) {
        return {
            head: parseHead(thickMatch[2]),
            stroke: "thick",
            length: thickMatch[1].length - 1,
        };
    }

    // Normal: -{2,}([>ox]?)
    const normalMatch = s.match(/^(-{2,})([>ox]?)$/);
    if (normalMatch) {
        return {
            head: parseHead(normalMatch[2]),
            stroke: "normal",
            length: normalMatch[1].length - 1,
        };
    }

    return null;
}

function parseHead(s: string): EdgeHead {
    if (s === ">") return "arrow";
    if (s === "o") return "circle";
    if (s === "x") return "cross";
    return "open";
}

// Matches a vertex spec prefix in a string, returns { spec, rest } or null.
// Handles all bracket forms; used for sequential parsing of edge lines.
const VERTEX_SPEC_PREFIX_RE =
    /^([\w.]+(?:\[\[[^\]]*\]\]|\(\[[^\]]*\]\)|\[[^\]]*\]|\([^)]*\)|\{[^}]*\})?)/;

const ARROW_RE = /^(-{2,}[>ox]?|={2,}[>ox]?|-\.+-[>ox]?|~{3,})/;

function parseEdgeLine(
    line: string,
    lineNum: number
): { source: VertexInfo; target: VertexInfo; label?: string; arrow: ReturnType<typeof parseArrowStr> } | null {
    let rest = line.trim();

    // Source vertex spec
    const sourceMatch = rest.match(VERTEX_SPEC_PREFIX_RE);
    if (!sourceMatch) return null;
    const source = parseVertexSpec(sourceMatch[1]);
    if (!source) return null;
    rest = rest.slice(sourceMatch[1].length).trimStart();

    // Arrow
    const arrowMatch = rest.match(ARROW_RE);
    if (!arrowMatch) return null;
    const arrow = parseArrowStr(arrowMatch[1]);
    if (!arrow) return null;
    rest = rest.slice(arrowMatch[1].length).trimStart();

    // Optional |label|
    let label: string | undefined;
    const labelMatch = rest.match(/^\|([^|]*)\|\s*/);
    if (labelMatch) {
        label = labelMatch[1].trim();
        rest = rest.slice(labelMatch[0].length);
    }

    // Target vertex spec (must consume the entire remaining string)
    const targetMatch = rest.match(VERTEX_SPEC_PREFIX_RE);
    if (!targetMatch) return null;
    const target = parseVertexSpec(targetMatch[1]);
    if (!target) return null;

    // Check nothing is left after target
    const leftover = rest.slice(targetMatch[1].length).trim();
    if (leftover.length > 0) {
        throw new ParseError(`Unexpected content after edge target: "${leftover}"`, lineNum);
    }

    return { source, target, label, arrow };
}

export function tokenize(content: string): TokenizerResult {
    const vertices = new Map<string, VertexInfo>();
    const edges: EdgeInfo[] = [];
    let layout: string | undefined;

    const lines = content.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
        const lineNum = i + 1;
        const line = lines[i];
        const trimmed = line.trim();

        if (trimmed === "") continue;

        // Front-matter comment: %% layout: name
        const layoutMatch = trimmed.match(/^%%\s+layout:\s*(.+)$/);
        if (layoutMatch) {
            layout = layoutMatch[1].trim();
            continue;
        }

        // Comment
        if (trimmed.startsWith("%%")) continue;

        // Flowchart header
        if (/^flowchart\s+\w+$/.test(trimmed)) continue;

        // Try to parse as an edge line
        const edgeParse = parseEdgeLine(trimmed, lineNum);
        if (edgeParse) {
            const { source, target, label, arrow } = edgeParse;

            // Register vertices (first declaration wins for shape/text)
            if (!vertices.has(source.id)) vertices.set(source.id, source);
            if (!vertices.has(target.id)) vertices.set(target.id, target);

            edges.push({
                sourceId: source.id,
                targetId: target.id,
                text: label,
                head: arrow!.head,
                stroke: arrow!.stroke,
                length: arrow!.length,
            });
            continue;
        }

        // Try standalone vertex declaration
        const vertexOnly = parseVertexSpec(trimmed);
        if (vertexOnly && vertexOnly.shape !== "none") {
            if (!vertices.has(vertexOnly.id)) vertices.set(vertexOnly.id, vertexOnly);
            continue;
        }

        throw new ParseError(`Unrecognized syntax "${trimmed}"`, lineNum);
    }

    return { vertices, edges, layout };
}
