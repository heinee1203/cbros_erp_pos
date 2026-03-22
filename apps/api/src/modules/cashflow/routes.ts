import type { FastifyPluginAsync } from "fastify";
import {
  listExpenses,
  createExpense,
  updateExpense,
  deactivateExpense,
  buildForecast,
  getCashFlowSummary,
} from "./service";

const ADMIN_ROLES = ["ADMIN", "MANAGER"];

export const cashflowRoutes: FastifyPluginAsync = async (app) => {
  // ═══════════════════════════════════════════
  // FORECAST
  // ═══════════════════════════════════════════

  // GET /cashflow/forecast
  app.get("/forecast", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    if (!ADMIN_ROLES.includes(role)) {
      return reply.status(403).send({ error: "Admin or Manager required" });
    }
    const q = request.query as { days?: string; startDate?: string };
    const days = Math.min(parseInt(q.days ?? "90", 10) || 90, 180);
    const result = await buildForecast(orgId, days, q.startDate);
    return reply.send(result);
  });

  // GET /cashflow/summary
  app.get("/summary", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    if (!ADMIN_ROLES.includes(role)) {
      return reply.status(403).send({ error: "Admin or Manager required" });
    }
    const result = await getCashFlowSummary(orgId);
    return reply.send(result);
  });

  // ═══════════════════════════════════════════
  // RECURRING EXPENSES
  // ═══════════════════════════════════════════

  // GET /cashflow/expenses
  app.get("/expenses", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const expenses = await listExpenses(orgId);
    return reply.send({ data: expenses });
  });

  // POST /cashflow/expenses
  app.post("/expenses", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    if (role !== "ADMIN") {
      return reply.status(403).send({ error: "Admin required" });
    }
    const body = request.body as any;
    const expense = await createExpense(orgId, body);
    return reply.status(201).send(expense);
  });

  // PATCH /cashflow/expenses/:id
  app.patch("/expenses/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    if (role !== "ADMIN") {
      return reply.status(403).send({ error: "Admin required" });
    }
    const body = request.body as any;
    const updated = await updateExpense(id, orgId, body);
    if (!updated) return reply.status(404).send({ error: "Expense not found" });
    return reply.send(updated);
  });

  // DELETE /cashflow/expenses/:id
  app.delete("/expenses/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    if (role !== "ADMIN") {
      return reply.status(403).send({ error: "Admin required" });
    }
    await deactivateExpense(id, orgId);
    return reply.send({ success: true });
  });
};
