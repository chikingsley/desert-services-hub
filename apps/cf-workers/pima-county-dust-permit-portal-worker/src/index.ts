const worker = {
  fetch(request: Request): Response {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({
        ok: true,
        service: "pima-county-dust-permit-portal-worker",
      });
    }

    return new Response("Not Found", { status: 404 });
  },
};

export default worker;
