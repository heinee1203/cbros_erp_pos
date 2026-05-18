import assert from "node:assert/strict";
import test from "node:test";

type RouteMethod = "get" | "post";

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
    post(path: string) {
      routes.push({ method: "post", path });
    },
  };

  return { app, routes };
}

test("shift route registration preserves public endpoint order", async () => {
  process.env.DATABASE_URL ??= "postgres://apex:apex@localhost:5432/apex_test";
  const { shiftRoutes } = await import("./routes");
  const { app, routes } = createRouteRecorder();

  await shiftRoutes(app as any, {} as any);

  assert.deepEqual(routes, [
    { method: "get", path: "/active" },
    { method: "get", path: "/" },
    { method: "get", path: "/:shiftId" },
    { method: "get", path: "/:shiftId/z-reading" },
    { method: "get", path: "/:shiftId/drawer-events" },
    { method: "post", path: "/:shiftId/close" },
    { method: "post", path: "/:shiftId/drawer-events" },
    { method: "post", path: "/:shiftId/force-close" },
  ]);
});
