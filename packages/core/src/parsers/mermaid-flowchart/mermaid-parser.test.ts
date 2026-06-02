import { describe, it, expect } from "vitest";
import { MermaidFlowchartParser } from "./index.js";
import type { ChoiceNode, GateNode, TextNode } from "../../types.js";

const parser = new MermaidFlowchartParser();

const BASIC = `\
%% layout: default
flowchart TD
    begin --> a[The barista looks up.]
    a --> b[What can I get you?]
    b --> c(A coffee, please.)
    b --> d(Nothing, just looking.)
    b -->|!| e(Is that a real sword?)

    c -->|+orderedCoffee| f[Coming right up.]
    f --> g{waitRandom}
    g --> h[Here you go. Nice and hot.]
    g --> i[Here you go. Careful, it's hot.]
    g --> j[Here you go.]

    d --> k[Alright, let me know if you change your mind.]
    k --> return

    e -->|+askedAboutSword| l[He glances down at his hip.]
    l --> clear
    clear --> m[Yeah. You want to hold it?]
    m --> n(Sure.)
    m --> o(No thanks.)
`;

const CHOICES = `\
flowchart TD
    begin --> intro[You stand at a fork in the road.]
    intro --> left(Go left.)
    intro --> right(Go right.)
    intro -->|!| secret(Check under the rock.)

    left ---> forest[The forest is dark and quiet.]
    forest --> gate{fork}
    gate --> path1[A narrow path winds uphill.]
    gate --> path2[A stream crosses your way.]
    gate --> path3[You hear something move.]

    right --> meadow[A sunny meadow opens before you.]
    meadow --> return

    secret --> hidden[You find a brass key.]
    hidden --> intro
`;

const STATE_CONDITIONS = `\
flowchart TD
    begin --> start[You enter the shop.]

    start --> door(Try the door.)
    start --> leave(Leave.)

    door -->|hasKey| open[The door opens easily.]
    door -->|!hasKey| locked[The door is locked.]

    locked -->|+triedDoor| grumble[You rattle the handle.]
    grumble --> start

    open -->|+enteredShop, level += 2| inside[Inside is warm and bright.]
    inside --> counter(Talk to the shopkeeper.)
    inside --> browse(Browse the shelves.)

    counter -->|profession == merchant| deal[She offers you a trade.]
    counter -->|hasGold| deal[She offers you a trade.]
    counter -->|profession != merchant, !hasGold| dismiss[She eyes you coolly.]

    browse -->|visits <= 2| items[Some interesting things on display.]
    browse -->|visits > 2| empty[The shelves look picked over.]

    leave --> return
`;

describe("MermaidFlowchartParser", () => {
    describe("BASIC — barista scene", () => {
        const scene = parser.parseScene("barista", BASIC).scene!;

        it("has correct scene id", () => {
            expect(scene.id).toBe("barista");
        });

        it("extracts layout", () => {
            expect(scene.layout).toBe("default");
        });

        it("entry node is 'a'", () => {
            expect(scene.entryNodeId).toBe("a");
        });

        it("does not include 'begin' as a node", () => {
            expect(scene.nodes["begin"]).toBeUndefined();
        });

        it("node 'a' is a TextNode", () => {
            const node = scene.nodes["a"] as TextNode;
            expect(node.type).toBe("text");
            expect(node.html).toBe("The barista looks up.");
        });

        it("node 'b' has three children in order", () => {
            expect(scene.nodes["b"].children.map((c) => c.nodeId)).toEqual(["c", "d", "e"]);
        });

        it("node 'c' is a ChoiceNode", () => {
            const node = scene.nodes["c"] as ChoiceNode;
            expect(node.type).toBe("choice");
            expect(node.html).toBe("A coffee, please.");
        });

        it("edge c -->|+orderedCoffee| f: effect on ChildRef.effects (target f is TextNode)", () => {
            const childF = scene.nodes["c"].children.find((c) => c.nodeId === "f");
            expect(childF?.effects).toEqual([
                { type: "set", name: "barista:orderedCoffee", value: true },
            ]);
        });

        it("gate 'g' is a GateNode with strategy random", () => {
            const node = scene.nodes["g"] as GateNode;
            expect(node.type).toBe("gate");
            expect(node.strategy).toBe("random");
        });

        it("node 'e' has repeat: 'once' from the ! shorthand", () => {
            expect((scene.nodes["e"] as ChoiceNode).repeat).toBe("once");
        });

        it("edge b -->|!| e sets visited: condition in the conditions array", () => {
            const childE = scene.nodes["b"].children.find((c) => c.nodeId === "e");
            expect(childE?.conditions).toEqual([
                { type: "check", name: "visited:barista:e", op: "falsy" },
            ]);
        });

        it("'clear' is a ClearNode", () => {
            expect(scene.nodes["clear"].type).toBe("clear");
        });

        it("'return' is a GateNode with strategy first", () => {
            const node = scene.nodes["return"] as GateNode;
            expect(node.type).toBe("gate");
            expect(node.strategy).toBe("first");
        });

        it("edge e -->|+askedAboutSword| l: effect on ChildRef (target l is TextNode)", () => {
            const childL = scene.nodes["e"].children.find((c) => c.nodeId === "l");
            expect(childL?.effects).toEqual([
                { type: "set", name: "barista:askedAboutSword", value: true },
            ]);
        });

        it("vars includes scoped variable names", () => {
            expect(scene.vars).toContain("barista:orderedCoffee");
            expect(scene.vars).toContain("barista:askedAboutSword");
            expect(scene.vars).toContain("visited:barista:e");
        });
    });

    describe("CHOICES", () => {
        const scene = parser.parseScene("forest", CHOICES).scene!;

        it("entry node is 'intro'", () => {
            expect(scene.entryNodeId).toBe("intro");
        });

        it("intro --> left has normal delay (beats=0)", () => {
            const childLeft = scene.nodes["intro"].children.find((c) => c.nodeId === "left");
            expect(childLeft?.delay).toEqual({ beats: 0, style: "dots" });
        });

        it("edge left ---> forest gets beats=1", () => {
            const childForest = scene.nodes["left"].children.find((c) => c.nodeId === "forest");
            expect(childForest?.delay).toEqual({ beats: 1, style: "dots" });
        });

        it("! shorthand sets repeat: once on 'secret'", () => {
            expect((scene.nodes["secret"] as ChoiceNode).repeat).toBe("once");
        });

        it("! shorthand sets visited: condition in conditions array", () => {
            const childSecret = scene.nodes["intro"].children.find((c) => c.nodeId === "secret");
            expect(childSecret?.conditions).toEqual([
                { type: "check", name: "visited:forest:secret", op: "falsy" },
            ]);
        });

        it("gate 'fork' has random strategy", () => {
            const node = scene.nodes["gate"] as GateNode;
            expect(node.type).toBe("gate");
            expect(node.strategy).toBe("random");
        });

        it("'return' is a GateNode with first strategy", () => {
            expect(scene.nodes["return"]?.type).toBe("gate");
            expect((scene.nodes["return"] as GateNode).strategy).toBe("first");
        });
    });

    describe("STATE_CONDITIONS", () => {
        const scene = parser.parseScene("shop", STATE_CONDITIONS).scene!;

        it("edge door -->|hasKey| open sets truthy condition", () => {
            const childOpen = scene.nodes["door"].children.find((c) => c.nodeId === "open");
            expect(childOpen?.conditions).toEqual([
                { type: "check", name: "shop:hasKey", op: "truthy" },
            ]);
        });

        it("edge door -->|!hasKey| locked sets falsy condition", () => {
            const childLocked = scene.nodes["door"].children.find((c) => c.nodeId === "locked");
            expect(childLocked?.conditions).toEqual([
                { type: "check", name: "shop:hasKey", op: "falsy" },
            ]);
        });

        it("edge locked -->|+triedDoor| grumble: effect on ChildRef (grumble is TextNode)", () => {
            const childGrumble = scene.nodes["locked"].children.find((c) => c.nodeId === "grumble");
            expect(childGrumble?.effects).toEqual([
                { type: "set", name: "shop:triedDoor", value: true },
            ]);
        });

        it("edge open -->|+enteredShop, level += 2| inside: two effects on ChildRef", () => {
            const childInside = scene.nodes["open"].children.find((c) => c.nodeId === "inside");
            expect(childInside?.effects).toEqual([
                { type: "set", name: "shop:enteredShop", value: true },
                { type: "increment", name: "shop:level", by: 2 },
            ]);
        });

        it("OR expressed as two edges — counter has two children pointing to deal", () => {
            const dealChildren = scene.nodes["counter"].children.filter((c) => c.nodeId === "deal");
            expect(dealChildren).toHaveLength(2);
            expect(dealChildren[0].conditions).toEqual([
                { type: "compare", name: "shop:profession", op: "==", value: "merchant" },
            ]);
            expect(dealChildren[1].conditions).toEqual([
                { type: "check", name: "shop:hasGold", op: "truthy" },
            ]);
        });

        it("edge counter -->|profession != merchant, !hasGold| dismiss: flat conditions array", () => {
            const childDismiss = scene.nodes["counter"].children.find((c) => c.nodeId === "dismiss");
            expect(childDismiss?.conditions).toEqual([
                { type: "compare", name: "shop:profession", op: "!=", value: "merchant" },
                { type: "check", name: "shop:hasGold", op: "falsy" },
            ]);
        });

        it("edge browse -->|visits <= 2| items", () => {
            const childItems = scene.nodes["browse"].children.find((c) => c.nodeId === "items");
            expect(childItems?.conditions).toEqual([
                { type: "compare", name: "shop:visits", op: "<=", value: 2 },
            ]);
        });

        it("edge browse -->|visits > 2| empty", () => {
            const childEmpty = scene.nodes["browse"].children.find((c) => c.nodeId === "empty");
            expect(childEmpty?.conditions).toEqual([
                { type: "compare", name: "shop:visits", op: ">", value: 2 },
            ]);
        });

        it("vars are scoped with scene id", () => {
            expect(scene.vars).toContain("shop:hasKey");
            expect(scene.vars).toContain("shop:triedDoor");
            expect(scene.vars).toContain("shop:profession");
            expect(scene.vars).toContain("shop:hasGold");
        });
    });

    describe("asset resolution", () => {
        it("text matching a scene asset becomes SceneNode", () => {
            const content = "flowchart TD\n    begin --> a\n    a --> portal[[chapter2.mmd]]";
            const scene = parser.parseScene("intro", content, { scenes: new Set(["chapter2.mmd"]) }).scene!;
            expect(scene.nodes["portal"]?.type).toBe("scene");
            expect((scene.nodes["portal"] as { sceneId: string }).sceneId).toBe("chapter2.mmd");
        });

        it("text matching an image asset becomes ImageNode", () => {
            const content = "flowchart TD\n    begin --> a\n    a --> img[sword.webp]";
            const scene = parser.parseScene("battle", content, { images: new Set(["sword.webp"]) }).scene!;
            expect(scene.nodes["img"]?.type).toBe("image");
        });

        it("asset type is determined by text match regardless of shape", () => {
            // square [text], subroutine [[text]], round (text), stadium ([text]) — all produce SceneNode
            const cases = [
                "flowchart TD\n    begin --> a[chapter2.mmd]",
                "flowchart TD\n    begin --> a[[chapter2.mmd]]",
                "flowchart TD\n    begin --> a(chapter2.mmd)",
                "flowchart TD\n    begin --> a([chapter2.mmd])",
            ];
            for (const content of cases) {
                const scene = parser.parseScene("intro", content, { scenes: new Set(["chapter2.mmd"]) }).scene!;
                expect(scene.nodes["a"]?.type).toBe("scene");
            }
        });

        it("subroutine shape [[...]] gives style 'emphasis' on asset nodes", () => {
            const content = "flowchart TD\n    begin --> a[[chapter2.mmd]]";
            const scene = parser.parseScene("intro", content, { scenes: new Set(["chapter2.mmd"]) }).scene!;
            expect((scene.nodes["a"] as { style?: string }).style).toBe("emphasis");
        });

        it("square shape [...] gives no style on asset nodes", () => {
            const content = "flowchart TD\n    begin --> a[chapter2.mmd]";
            const scene = parser.parseScene("intro", content, { scenes: new Set(["chapter2.mmd"]) }).scene!;
            expect((scene.nodes["a"] as { style?: string }).style).toBeUndefined();
        });

        it("shape style applies equally to image and custom asset nodes", () => {
            const imgContent = "flowchart TD\n    begin --> a[[sword.webp]]";
            const imgScene = parser.parseScene("s", imgContent, { images: new Set(["sword.webp"]) }).scene!;
            expect((imgScene.nodes["a"] as { style?: string }).style).toBe("emphasis");

            const customContent = "flowchart TD\n    begin --> a[[MyRenderer]]";
            const customScene = parser.parseScene("s", customContent, { custom: new Set(["MyRenderer"]) }).scene!;
            expect((customScene.nodes["a"] as { style?: string }).style).toBe("emphasis");
        });
    });

    describe("onChoose placement", () => {
        it("effect on edge pointing TO a ChoiceNode goes on that node's onChoose", () => {
            const scene = parser.parseScene(
                "s",
                "flowchart TD\n    begin --> a\n    a -->|+flag| b(A choice.)",
            ).scene!;
            expect((scene.nodes["b"] as ChoiceNode).onChoose).toEqual([
                { type: "set", name: "s:flag", value: true },
            ]);
        });

        it("effect on edge pointing to a TextNode stays on ChildRef.effects", () => {
            const scene = parser.parseScene(
                "s",
                "flowchart TD\n    begin --> a(A choice.)\n    a -->|+flag| b[Result.]",
            ).scene!;
            const childB = scene.nodes["a"].children.find((c) => c.nodeId === "b");
            expect(childB?.effects).toEqual([{ type: "set", name: "s:flag", value: true }]);
        });
    });

    describe("scope prefixing", () => {
        it("variables with ':' are not re-prefixed", () => {
            const scene = parser.parseScene(
                "myscene",
                "flowchart TD\n    begin --> a\n    a -->|global:flag| b",
            ).scene!;
            expect(scene.nodes["a"].children[0].conditions).toEqual([
                { type: "check", name: "global:flag", op: "truthy" },
            ]);
        });

        it("variables without ':' get scene prefix", () => {
            const scene = parser.parseScene(
                "myscene",
                "flowchart TD\n    begin --> a\n    a -->|myVar| b",
            ).scene!;
            expect(scene.nodes["a"].children[0].conditions).toEqual([
                { type: "check", name: "myscene:myVar", op: "truthy" },
            ]);
        });
    });

    describe("delay from edge stroke", () => {
        it("normal --> gets dots delay, beats=0", () => {
            const scene = parser.parseScene("s", "begin --> a\na --> b").scene!;
            expect(scene.nodes["a"].children[0].delay).toEqual({ beats: 0, style: "dots" });
        });

        it("longer ---> gets beats=1", () => {
            const scene = parser.parseScene("s", "begin --> a\na ---> b").scene!;
            expect(scene.nodes["a"].children[0].delay).toEqual({ beats: 1, style: "dots" });
        });

        it("thick ==> gets pause delay", () => {
            const scene = parser.parseScene("s", "begin --> a\na ==> b").scene!;
            expect(scene.nodes["a"].children[0].delay).toEqual({ beats: 0, style: "pause" });
        });

        it("dotted -.-> gets fade delay", () => {
            const scene = parser.parseScene("s", "begin --> a\na -.-> b").scene!;
            expect(scene.nodes["a"].children[0].delay).toEqual({ beats: 0, style: "fade" });
        });

        it("invisible ~~~ produces no delay", () => {
            const scene = parser.parseScene("s", "begin --> a\na ~~~ b").scene!;
            expect(scene.nodes["a"].children[0].delay).toBeUndefined();
        });
    });

    describe("entry node detection", () => {
        it("uses begin --> x to set entry node", () => {
            const scene = parser.parseScene("s", "begin --> a[Hello]\na --> b").scene!;
            expect(scene.entryNodeId).toBe("a");
        });

        it("falls back to source of first edge when no begin", () => {
            const scene = parser.parseScene("s", "a[Hello] --> b").scene!;
            expect(scene.entryNodeId).toBe("a");
        });
    });

    describe("parse errors", () => {
        it("returns { scene: null, issues } instead of throwing on bad input", () => {
            const result = parser.parseScene("s", "flowchart TD\n    @@invalid@@");
            expect(result.scene).toBeNull();
            expect(result.issues).toHaveLength(1);
            expect(result.issues[0]).toMatchObject({ severity: "error", code: "parse_error" });
        });

        it("issue includes line number when available", () => {
            const result = parser.parseScene("s", "flowchart TD\n    @@invalid@@");
            expect(result.issues[0].line).toBeDefined();
        });
    });

});
