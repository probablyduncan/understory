import { describe, it, expect } from "vitest";
import { tokenize } from "./tokenizer.js";
import { ParseError } from "../index.js";

describe("tokenize", () => {
    describe("header and comments", () => {
        it("parses flowchart header without error", () => {
            expect(() => tokenize("flowchart TD\n    a --> b")).not.toThrow();
        });

        it("skips comment lines", () => {
            const { vertices } = tokenize("%% this is a comment\na --> b");
            expect(vertices.has("a")).toBe(true);
        });

        it("extracts layout from front-matter comment", () => {
            const { layout } = tokenize("%% layout: title-card\nflowchart TD\na --> b");
            expect(layout).toBe("title-card");
        });

        it("ignores non-layout %% comments", () => {
            const { layout } = tokenize("%% some other comment\na --> b");
            expect(layout).toBeUndefined();
        });
    });

    describe("vertex shapes", () => {
        it("square brackets → square", () => {
            const { vertices } = tokenize("a --> b[Square text]");
            expect(vertices.get("b")).toMatchObject({ id: "b", shape: "square", text: "Square text" });
        });

        it("round parens → round", () => {
            const { vertices } = tokenize("a --> b(Round text)");
            expect(vertices.get("b")).toMatchObject({ shape: "round", text: "Round text" });
        });

        it("diamond braces → diamond", () => {
            const { vertices } = tokenize("a --> b{Diamond}");
            expect(vertices.get("b")).toMatchObject({ shape: "diamond", text: "Diamond" });
        });

        it("double brackets → subroutine", () => {
            const { vertices } = tokenize("a --> b[[Subroutine]]");
            expect(vertices.get("b")).toMatchObject({ shape: "subroutine", text: "Subroutine" });
        });

        it("stadium → ([text])", () => {
            const { vertices } = tokenize("a --> b([Stadium])");
            expect(vertices.get("b")).toMatchObject({ shape: "stadium", text: "Stadium" });
        });

        it("bare id → none", () => {
            const { vertices } = tokenize("a --> b");
            expect(vertices.get("b")).toMatchObject({ shape: "none", text: undefined });
        });

        it("first declaration wins for shape", () => {
            const { vertices } = tokenize("a[Hello] --> b\nb --> a");
            expect(vertices.get("a")).toMatchObject({ shape: "square", text: "Hello" });
        });
    });

    describe("edge types", () => {
        it("normal arrow -->", () => {
            const { edges } = tokenize("a --> b");
            expect(edges[0]).toMatchObject({ stroke: "normal", head: "arrow", length: 1 });
        });

        it("longer normal arrow --->", () => {
            const { edges } = tokenize("a ---> b");
            expect(edges[0]).toMatchObject({ stroke: "normal", head: "arrow", length: 2 });
        });

        it("even longer ---->", () => {
            const { edges } = tokenize("a ----> b");
            expect(edges[0]).toMatchObject({ stroke: "normal", head: "arrow", length: 3 });
        });

        it("circle head --o", () => {
            const { edges } = tokenize("a --o b");
            expect(edges[0]).toMatchObject({ stroke: "normal", head: "circle" });
        });

        it("cross head --x", () => {
            const { edges } = tokenize("a --x b");
            expect(edges[0]).toMatchObject({ stroke: "normal", head: "cross" });
        });

        it("open head ---", () => {
            const { edges } = tokenize("a --- b");
            expect(edges[0]).toMatchObject({ stroke: "normal", head: "open" });
        });

        it("thick arrow ==>", () => {
            const { edges } = tokenize("a ==> b");
            expect(edges[0]).toMatchObject({ stroke: "thick", head: "arrow", length: 1 });
        });

        it("longer thick ===>", () => {
            const { edges } = tokenize("a ===> b");
            expect(edges[0]).toMatchObject({ stroke: "thick", head: "arrow", length: 2 });
        });

        it("dotted arrow -.->", () => {
            const { edges } = tokenize("a -.-> b");
            expect(edges[0]).toMatchObject({ stroke: "dotted", head: "arrow", length: 1 });
        });

        it("longer dotted -..->", () => {
            const { edges } = tokenize("a -..-> b");
            expect(edges[0]).toMatchObject({ stroke: "dotted", head: "arrow", length: 2 });
        });

        it("invisible ~~~", () => {
            const { edges } = tokenize("a ~~~ b");
            expect(edges[0]).toMatchObject({ stroke: "invisible" });
        });
    });

    describe("edge labels", () => {
        it("edge with label", () => {
            const { edges } = tokenize("a -->|my label| b");
            expect(edges[0].text).toBe("my label");
        });

        it("edge without label", () => {
            const { edges } = tokenize("a --> b");
            expect(edges[0].text).toBeUndefined();
        });

        it("edge label with state expression", () => {
            const { edges } = tokenize("a -->|+hasKey| b");
            expect(edges[0].text).toBe("+hasKey");
        });

        it("edge with source and target shapes and label", () => {
            const { edges, vertices } = tokenize("a[Hello] -->|label| b(Choice)");
            expect(edges[0]).toMatchObject({ sourceId: "a", targetId: "b", text: "label" });
            expect(vertices.get("a")).toMatchObject({ shape: "square", text: "Hello" });
            expect(vertices.get("b")).toMatchObject({ shape: "round", text: "Choice" });
        });
    });

    describe("layout front-matter", () => {
        it("extracts layout name", () => {
            const { layout } = tokenize("%% layout: my-layout\na --> b");
            expect(layout).toBe("my-layout");
        });
    });

    describe("standalone vertex declarations", () => {
        it("standalone vertex is registered", () => {
            const { vertices } = tokenize("myNode[My Text]\na --> myNode");
            expect(vertices.get("myNode")).toMatchObject({ shape: "square", text: "My Text" });
        });
    });

    describe("edge ordering", () => {
        it("preserves declaration order", () => {
            const { edges } = tokenize("a --> b\na --> c\na --> d");
            expect(edges.map((e) => e.targetId)).toEqual(["b", "c", "d"]);
        });
    });

    describe("errors", () => {
        it("throws ParseError for unrecognized syntax", () => {
            expect(() => tokenize("a --> b\n???garbage???")).toThrow(ParseError);
        });

        it("error includes line number", () => {
            try {
                tokenize("a --> b\n???");
            } catch (e) {
                expect((e as ParseError).line).toBe(2);
            }
        });
    });
});
