import type { FastifyInstance } from "fastify";
import { assertAdmin } from "./route-support";
import {
  createBankAccount,
  deactivateBankAccount,
  listBankAccounts,
  updateBankAccount,
} from "./bank-account-service";

export function registerBankAccountRoutes(app: FastifyInstance) {
  app.get("/bank-accounts", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const result = await listBankAccounts(orgId);
    return reply.send(result);
  });

  app.post("/bank-accounts", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;

    try {
      assertAdmin(role);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    const body = request.body as {
      bankName: string;
      accountName: string;
      accountNumber: string;
      branch?: string;
      isDefault?: boolean;
    };

    if (!body.bankName || !body.accountName || !body.accountNumber) {
      return reply.status(400).send({
        error: "bankName, accountName, and accountNumber are required",
      });
    }

    try {
      const result = await createBankAccount(orgId, body);
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.patch("/bank-accounts/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;

    try {
      assertAdmin(role);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    const body = request.body as {
      bankName?: string;
      accountName?: string;
      accountNumber?: string;
      branch?: string;
      isDefault?: boolean;
    };

    try {
      const result = await updateBankAccount(orgId, id, body);
      return reply.send(result);
    } catch (err: any) {
      if (err.message === "Bank account not found") {
        return reply.status(404).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  app.delete("/bank-accounts/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;

    try {
      assertAdmin(role);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    try {
      await deactivateBankAccount(orgId, id);
      return reply.send({ success: true });
    } catch (err: any) {
      if (err.message === "Bank account not found") {
        return reply.status(404).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  });
}
