export default {
  async fetch(request) {
    return Response.json({
      ok: true,
      name: "pg-straitwing",
      path: new URL(request.url).pathname,
    });
  },
};
