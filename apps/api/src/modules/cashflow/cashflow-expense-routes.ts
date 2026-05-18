import type { FastifyInstance } from "fastify";
import {
  createExpense,
  deactivateExpense,
  listExpenses,
  updateExpense,
} from "./cashflow-route-service";
import { sendCashflowAdminRequired } from "./cashflow-route-helpers";

export async function registerCashflowExpenseRoutes(app: FastifyInstance) {
  app.get("/expenses", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const expenses = await listExpenses(orgId);
    return reply.send({ data: expenses });
  });

  app.post("/expenses", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    if (role !== "ADMIN") {
      return sendCashflowAdminRequired(reply);
    }
    const body = request.body as any;
    const expense = await createExpense(orgId, body);
    return reply.status(201).send(expense);
  });

  app.patch("/expenses/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    if (role !== "ADMIN") {
      return sendCashflowAdminRequired(reply);
    }
    const body = request.body as any;
    const updated = await updateExpense(id, orgId, body);
    if (!updated) return reply.status(404).send({ error: "Expense not found" });
    return reply.send(updated);
  });

  app.delete("/expenses/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    if (role !== "ADMIN") {
      return sendCashflowAdminRequired(reply);
    }
    await deactivateExpense(id, orgId);
    return reply.send({ success: true });
  });
}
