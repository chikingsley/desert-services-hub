import { handleMaricopaCreatePost } from "./create";
import {
  handlePage2MapKmlPost,
  handlePage2MapParcelPost,
  handlePage2MapRenewalPost,
} from "./pages/page2-map-http";

const jsonError = (error: string, status = 400): Response =>
  Response.json({ error, success: false }, { status });

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/api/health") {
        return Response.json({
          ok: true,
          service: "maricopa-county-dust-permit-portal-worker",
        });
      }

      if (url.pathname === "/api/page2-map/kml") {
        return await handlePage2MapKmlPost(request);
      }

      if (url.pathname === "/api/page2-map/renewal") {
        return await handlePage2MapRenewalPost(request);
      }

      if (url.pathname === "/api/page2-map/parcel") {
        return await handlePage2MapParcelPost(request);
      }

      if (url.pathname === "/api/create") {
        return await handleMaricopaCreatePost(request, env);
      }

      return new Response("Not Found", { status: 404 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return jsonError(message, 500);
    }
  },
} satisfies ExportedHandler<Env>;
