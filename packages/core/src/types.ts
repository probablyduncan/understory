export type StateValue = boolean | string | number;

export type StateCondition =
    | { type: "check"; name: string; op: "truthy" | "falsy" }
    | { type: "compare"; name: string; op: "==" | "!=" | ">" | "<" | ">=" | "<="; value: StateValue };

export type StateEffect =
    | { type: "set"; name: string; value: StateValue }
    | { type: "unset"; name: string }
    | { type: "increment"; name: string; by: number }
    | { type: "toggle"; name: string };

export type Delay = {
    beats: number;
    style?: "dots" | "pause" | "fade" | string;
};

export type ChildRef = {
    nodeId: string;
    delay?: Delay;
    conditions?: StateCondition[];
    effects?: StateEffect[];
};

export type NodeBase = {
    id: string;
    children: ChildRef[];
};

export type TextNode = NodeBase & {
    type: "text";
    html: string;
    style?: string;
};

export type ChoiceNode = NodeBase & {
    type: "choice";
    html: string;
    label?: string;
    style?: string;
    clear?: boolean;
    repeat?: "always" | "fade" | "once";
    onChoose?: StateEffect[];
};

export type ImageNode = NodeBase & {
    type: "image";
    src: string;
    alt: string;
    style?: string;
};

export type SceneNode = NodeBase & {
    type: "scene";
    sceneId: string;
};

export type CustomNode = NodeBase & {
    type: "custom";
    name: string;
    params?: Record<string, unknown>;
};

export type GateNode = NodeBase & {
    type: "gate";
    strategy?: "first" | "random";
};

export type ClearNode = NodeBase & {
    type: "clear";
};

export type StoryNode =
    | TextNode
    | ChoiceNode
    | ImageNode
    | SceneNode
    | CustomNode
    | GateNode
    | ClearNode;

export type Scene = {
    id: string;
    nodes: Record<string, StoryNode>;
    entryNodeId: string;
    vars: string[];
    layout?: string;
    meta?: {
        source?: string;
        title?: string;
    };
};
