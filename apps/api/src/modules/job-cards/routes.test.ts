import assert from "node:assert/strict";
import test from "node:test";

type RouteMethod = "get" | "patch" | "post";

type RegisteredRoute = {
  method: RouteMethod;
  path: string;
};

function createRouteRecorder() {
  const routes: RegisteredRoute[] = [];
  const app = {
    get(path: string) {
      routes.push({ method: "get", path });
    },
    patch(path: string) {
      routes.push({ method: "patch", path });
    },
    post(path: string) {
      routes.push({ method: "post", path });
    },
  };

  return { app, routes };
}

test("job-card route registration preserves public endpoint order", async () => {
  process.env.DATABASE_URL ??= "postgres://apex:apex@localhost:5432/apex_test";
  const { jobCardRoutes } = await import("./routes");
  const { app, routes } = createRouteRecorder();

  await jobCardRoutes(app as any, {} as any);

  assert.deepEqual(routes, [
    { method: "post", path: "/service-operations" },
    { method: "patch", path: "/service-operations/:id" },
    { method: "get", path: "/service-operations" },
    { method: "get", path: "/service-operations/:id" },
    { method: "post", path: "/" },
    { method: "get", path: "/" },
    { method: "get", path: "/:id" },
    { method: "get", path: "/by-number/:jobNo" },
    { method: "post", path: "/:id/check-in" },
    { method: "post", path: "/:id/start-estimating" },
    { method: "post", path: "/:id/labor" },
    { method: "post", path: "/:id/parts" },
    { method: "patch", path: "/parts/:partId/qty" },
    { method: "post", path: "/:id/approve" },
    { method: "post", path: "/:id/move-to-bay" },
    { method: "post", path: "/:id/start-work" },
    { method: "post", path: "/:id/issue-parts" },
    { method: "post", path: "/:id/return-parts" },
    { method: "post", path: "/:id/complete-work" },
    { method: "post", path: "/:id/invoice" },
    { method: "post", path: "/:id/close" },
    { method: "post", path: "/:id/cancel" },
    { method: "get", path: "/:id/journal" },
  ]);
});
