import { readdir, readFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Scene, StoryIssue } from "@probablyduncan/understory-core";
import { validateScenes } from "@probablyduncan/understory-core";
import type { ContentSource } from "./config.js";

export type LoadedContent = {
    scenes: Set<string>;
    images: Set<string>;
    custom: Set<string>;
};

export type LoadedScene = {
    id: string;
    filepath: string;
    scene: Scene | null;
    issues: StoryIssue[];
};

const DEFAULT_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".avif"];
const DEFAULT_CUSTOM_EXTENSIONS = [".ts", ".tsx"];

async function scanDir(dirPath: string, extensions: string[]): Promise<string[]> {
    const extSet = new Set(extensions.map((e) => e.toLowerCase()));
    let entries: string[];

    try {
        // readdir with recursive:true returns relative paths like "subdir/file.txt"
        entries = await readdir(dirPath, { recursive: true, encoding: "utf-8" });
    } catch {
        return [];
    }

    return entries
        .filter((rel) => extSet.has(extname(rel).toLowerCase()))
        .map((rel) => join(dirPath, rel));
}

export async function loadContent(
    sources: ContentSource[],
    root: URL,
    startSceneId?: string,
): Promise<{ content: LoadedContent; scenes: LoadedScene[] }> {
    const rootDir = fileURLToPath(root);

    const content: LoadedContent = {
        scenes: new Set(),
        images: new Set(),
        custom: new Set(),
    };

    // First pass: scan all non-scene sources to build asset Sets, and collect scene file paths
    type SceneFile = { filepath: string; source: Extract<ContentSource, { type: "scenes" }> };
    const sceneFiles: SceneFile[] = [];
    const seenSceneIds = new Map<string, string>(); // id → filepath (for collision detection)
    const collisionWarnings: Array<{ id: string; message: string }> = [];

    for (const source of sources) {
        const dirPath = resolve(rootDir, source.dir);

        if (source.type === "images") {
            const extensions = source.extensions ?? DEFAULT_IMAGE_EXTENSIONS;
            const files = await scanDir(dirPath, extensions);
            for (const filepath of files) {
                content.images.add(basename(filepath));
            }
        } else if (source.type === "custom") {
            const extensions = source.extensions ?? DEFAULT_CUSTOM_EXTENSIONS;
            const files = await scanDir(dirPath, extensions);
            for (const filepath of files) {
                const name = basename(filepath, extname(filepath));
                content.custom.add(name);
            }
        } else if (source.type === "scenes") {
            const extensions = source.extensions ?? source.parser.extensions;
            const files = await scanDir(dirPath, extensions);
            for (const filepath of files) {
                const id = basename(filepath);
                if (seenSceneIds.has(id)) {
                    collisionWarnings.push({
                        id,
                        message: `Scene ID collision: "${id}" found at both "${seenSceneIds.get(id)}" and "${filepath}". Using first.`,
                    });
                } else {
                    seenSceneIds.set(id, filepath);
                    content.scenes.add(id);
                    sceneFiles.push({ filepath, source });
                }
            }
        }
    }

    // Second pass: parse all scene files now that we have complete asset Sets
    const parserOptions = {
        scenes: content.scenes,
        images: content.images,
        custom: content.custom,
    };

    const loadedScenes: LoadedScene[] = [];

    for (const { filepath, source } of sceneFiles) {
        const id = basename(filepath);
        let fileContent: string;

        try {
            fileContent = await readFile(filepath, "utf-8");
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            loadedScenes.push({
                id,
                filepath,
                scene: null,
                issues: [{ severity: "error", code: "file_read_error", message }],
            });
            continue;
        }

        const { scene, issues } = source.parser.parseScene(id, fileContent, parserOptions);
        loadedScenes.push({ id, filepath, scene, issues: [...issues] });
    }

    // Third pass: cross-scene validation (missing scene refs, orphan scenes, etc.)
    const parsedScenes = loadedScenes.filter((s) => s.scene !== null).map((s) => s.scene!);
    if (parsedScenes.length > 0) {
        const { issues: crossIssues } = validateScenes(parsedScenes, startSceneId);
        for (const issue of crossIssues) {
            const target = issue.sceneId
                ? loadedScenes.find((s) => s.id === issue.sceneId)
                : undefined;
            if (target) {
                target.issues.push(issue);
            } else {
                loadedScenes[0]?.issues.push(issue);
            }
        }
    }

    // Attach collision warnings to the winning scene (the first one found with that ID)
    for (const { id, message } of collisionWarnings) {
        const target = loadedScenes.find((s) => s.id === id);
        target?.issues.push({ severity: "warning", code: "scene_id_collision", message });
    }

    return { content, scenes: loadedScenes };
}
