import assert from "node:assert/strict";
import test from "node:test";

type RouteMethod = "delete" | "get" | "patch" | "post";

type RegisteredRoute = {
  method: RouteMethod;
  path: string;
};

function createRouteRecorder() {
  const routes: RegisteredRoute[] = [];
  const hooks: Array<{ name: string }> = [];
  const app = {
    addHook(name: string) {
      hooks.push({ name });
    },
    get(path: string) {
      routes.push({ method: "get", path });
    },
    post(path: string) {
      routes.push({ method: "post", path });
    },
    patch(path: string) {
      routes.push({ method: "patch", path });
    },
    delete(path: string) {
      routes.push({ method: "delete", path });
    },
  };

  return { app, hooks, routes };
}

test("import route registration preserves guard hook and public endpoint order", async () => {
  process.env.DATABASE_URL ??= "postgres://apex:apex@localhost:5432/apex_test";
  const { importRoutes } = await import("./routes");
  const { app, hooks, routes } = createRouteRecorder();

  await importRoutes(app as any, {} as any);

  assert.deepEqual(hooks, [{ name: "preHandler" }]);
  assert.deepEqual(routes, [
    { method: "post", path: "/preview" },
    { method: "post", path: "/execute" },
    { method: "get", path: "/progress/:token" },
    { method: "post", path: "/rollback/latest" },
    { method: "get", path: "/profiles" },
    { method: "post", path: "/profiles" },
    { method: "patch", path: "/profiles/:profileId" },
    { method: "delete", path: "/profiles/:profileId" },
    { method: "get", path: "/location-mappings" },
    { method: "post", path: "/save-location-mappings" },
    { method: "post", path: "/receipts-preview" },
    { method: "post", path: "/receipts-execute" },
    { method: "post", path: "/backfill-orphaned-sales" },
  ]);
});
