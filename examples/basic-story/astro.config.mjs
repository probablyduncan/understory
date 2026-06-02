import { defineConfig } from "astro/config";
import understory, { MermaidFlowchartParser } from "@probablyduncan/understory-astro";

export default defineConfig({
    integrations: [
        understory({
            startSceneId: "intro.mmd",
            content: [
                { dir: "src/scenes", type: "scenes", parser: new MermaidFlowchartParser() },
            ],
        }),
    ],
});
