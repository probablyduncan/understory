import type { AstroIntegration } from "astro";
import type { UnderstoryConfig } from "./config.js";
import { loadContent } from "./loader.js";

export * from "@probablyduncan/understory-core";
export * from "@probablyduncan/understory-runtime";

export default function understory(config: UnderstoryConfig): AstroIntegration {
    return {
        name: "@probablyduncan/understory",
        hooks: {
            "astro:config:setup": async ({ config: astroConfig, logger }) => {
                const { scenes } = await loadContent(config.content, astroConfig.root, config.startSceneId);

                for (const { id, issues } of scenes) {
                    for (const issue of issues) {
                        const msg = `[${id}] ${issue.message}`;
                        if (issue.severity === "error") logger.error(msg);
                        else logger.warn(msg);
                    }
                }
            },
        },
    };
}
