import assert from "node:assert/strict";
import test from "node:test";

type RegisteredRoute = {
  method: "delete" | "get" | "post" | "put";
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
    post(path: string) {
      routes.push({ method: "post", path });
    },
    put(path: string) {
      routes.push({ method: "put", path });
    },
  };

  return { app, routes };
}

test("printing route registration preserves public endpoint order", async () => {
  process.env.DATABASE_URL ??= "postgres://apex:apex@localhost:5432/apex_test";
  const { printingRoutes } = await import("./routes");
  const { app, routes } = createRouteRecorder();

  await printingRoutes(app as any);

  assert.deepEqual(routes, [
    { method: "get", path: "/printers" },
    { method: "get", path: "/printers/:id" },
    { method: "post", path: "/printers" },
    { method: "put", path: "/printers/:id" },
    { method: "delete", path: "/printers/:id" },
    { method: "post", path: "/zpl" },
    { method: "post", path: "/zpl/send" },
    { method: "post", path: "/zpl/test" },
    { method: "post", path: "/preview" },
    { method: "get", path: "/system-printers" },
    { method: "post", path: "/system-print" },
  ]);
});
