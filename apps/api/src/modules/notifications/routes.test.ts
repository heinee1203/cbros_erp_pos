import assert from "node:assert/strict";
import test from "node:test";

type RouteMethod = "delete" | "get" | "patch" | "post";

type RegisteredRoute = {
  method: RouteMethod;
  path: string;
};

function createRouteRecorder() {
  const routes: RegisteredRoute[] = [];
  const app = {
    delete(path: string) {
      routes.push({ method: "delete", path });
    },
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

test("notification route registration preserves public endpoint order", async () => {
  process.env.DATABASE_URL ??= "postgres://apex:apex@localhost:5432/apex_test";
  const { notificationRoutes } = await import("./routes");
  const { app, routes } = createRouteRecorder();

  await notificationRoutes(app as any, {} as any);

  assert.deepEqual(routes, [
    { method: "get", path: "/" },
    { method: "get", path: "/unread-count" },
    { method: "patch", path: "/:id/read" },
    { method: "post", path: "/mark-all-read" },
    { method: "delete", path: "/:id" },
    { method: "get", path: "/settings" },
    { method: "patch", path: "/settings" },
    { method: "post", path: "/daily-digest" },
  ]);
});
