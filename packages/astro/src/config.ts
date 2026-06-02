import type { Parser } from "@probablyduncan/understory-core/parsers";

export type SceneSource = {
    dir: string;
    type: "scenes";
    parser: Parser;
    extensions?: string[];
};

export type ImageSource = {
    dir: string;
    type: "images";
    extensions?: string[];
};

export type CustomSource = {
    dir: string;
    type: "custom";
    extensions?: string[];
};

export type ContentSource = SceneSource | ImageSource | CustomSource;

export type UnderstoryConfig = {
    startSceneId: string;
    content: ContentSource[];
};
