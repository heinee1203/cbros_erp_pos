import assert from "node:assert/strict";
import test from "node:test";

type RegisteredRoute = {
  method: "get";
  path: string;
};

function createRouteRecorder() {
  const routes: RegisteredRoute[] = [];
  const app = {
    get(path: string) {
      routes.push({ method: "get", path });
    },
  };

  return { app, routes };
}

test("stock journal route registration preserves public endpoint order", async () => {
  process.env.DATABASE_URL ??= "postgres://apex:apex@localhost:5432/apex_test";
  const { stockJournalRoutes } = await import("./routes");
  const { app, routes } = createRouteRecorder();

  await stockJournalRoutes(app as any, {} as any);

  assert.deepEqual(routes, [{ method: "get", path: "/" }]);
});
