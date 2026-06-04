import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";
import type { UnderstoryConfig } from "./config.js";
import { loadContent } from "./loader.js";
import { buildSceneEndpoints, buildScenesVirtualModuleCode } from "./endpoints.js";

export * from "@probablyduncan/understory-core";
export * from "@probablyduncan/understory-runtime";

const VIRTUAL_SCENES_ID = "virtual:understory/scenes";
const RESOLVED_VIRTUAL_SCENES_ID = "\0" + VIRTUAL_SCENES_ID;

export default function understory(config: UnderstoryConfig): AstroIntegration {
    return {
        name: "@probablyduncan/understory",
        hooks: {
            "astro:config:setup": async ({ config: astroConfig, logger, injectRoute, updateConfig }) => {
                const { scenes } = await loadContent(config.content, astroConfig.root, config.startSceneId);

                const collisions = scenes.flatMap((s) => s.issues).filter((i) => i.code === "scene_id_collision");
                if (collisions.length > 0) {
                    throw new Error(collisions.map((i) => i.message).join("\n"));
                }

                for (const { id, issues } of scenes) {
                    for (const issue of issues) {
                        const msg = `[${id}] ${issue.message}`;
                        if (issue.severity === "error") logger.error(msg);
                        else logger.warn(msg);
                    }
                }

                const sceneMap = buildSceneEndpoints(scenes);
                let moduleCode = buildScenesVirtualModuleCode(sceneMap);

                const rootDir = fileURLToPath(astroConfig.root);
                const contentDirs = config.content.map((s) => resolve(rootDir, s.dir));

                updateConfig({
                    vite: {
                        plugins: [
                            {
                                name: "understory:virtual-scenes",
                                resolveId(id: string) {
                                    if (id === VIRTUAL_SCENES_ID) return RESOLVED_VIRTUAL_SCENES_ID;
                                },
                                load(id: string) {
                                    if (id === RESOLVED_VIRTUAL_SCENES_ID) return moduleCode;
                                },
                                async configureServer(server) {
                                    for (const dir of contentDirs) {
                                        server.watcher.add(dir);
                                    }
                                    const reload = async () => {
                                        const { scenes: freshScenes } = await loadContent(
                                            config.content,
                                            astroConfig.root,
                                            config.startSceneId,
                                        );
                                        for (const { id, issues } of freshScenes) {
                                            for (const issue of issues) {
                                                const msg = `[${id}] ${issue.message}`;
                                                if (issue.severity === "error") logger.error(msg);
                                                else logger.warn(msg);
                                            }
                                        }
                                        moduleCode = buildScenesVirtualModuleCode(
                                            buildSceneEndpoints(freshScenes),
                                        );
                                        const mod = server.moduleGraph.getModuleById(
                                            RESOLVED_VIRTUAL_SCENES_ID,
                                        );
                                        if (mod) {
                                            server.moduleGraph.invalidateModule(mod);
                                            server.hot.send({ type: "full-reload" });
                                        }
                                    };
                                    server.watcher.on("change", reload);
                                    server.watcher.on("add", reload);
                                    server.watcher.on("unlink", reload);
                                },
                            },
                        ],
                    },
                });

                injectRoute({
                    pattern: "/api/scenes/[id].json",
                    entrypoint: fileURLToPath(
                        new URL("../src/pages/api/scenes/scene.ts", import.meta.url),
                    ),
                    prerender: true,
                });
            },
        },
    };
}
