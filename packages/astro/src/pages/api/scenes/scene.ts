import type { APIRoute, GetStaticPaths } from "astro";
import type { Scene } from "@probablyduncan/understory-core";
// @ts-ignore virtual module resolved by Vite plugin
import { scenes } from "virtual:understory/scenes";

export const prerender = true;

export const getStaticPaths: GetStaticPaths = () => {
    return [...(scenes as Map<string, Scene>).keys()].map((id) => ({
        params: { id },
    }));
};

export const GET: APIRoute = ({ params }) => {
    const scene = (scenes as Map<string, Scene>).get(params.id as string);
    return new Response(JSON.stringify(scene), {
        headers: { "Content-Type": "application/json; charset=utf-8" },
    });
};
