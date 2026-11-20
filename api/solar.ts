import worker, { type Env } from "../server/worker";

const productionOrigin =
  "https://solar-sales-desk-alphacentauricai-8714s-projects.vercel.app";

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.searchParams.get("__solar_route");
    if (path !== null) {
      if (!/^[a-z-]+(?:\/[a-z-]+)*$/.test(path))
        return new Response("Not found", { status: 404 });
      url.pathname = "/api/" + path;
      url.searchParams.delete("__solar_route");
    }
    const env = {
      ...process.env,
      ALLOWED_ORIGIN: productionOrigin,
    } as Env;
    return worker.fetch(path === null ? request : new Request(url, request), env);
  },
};
