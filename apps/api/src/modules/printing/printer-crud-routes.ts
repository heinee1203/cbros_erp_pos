import type { FastifyInstance } from "fastify";
import {
  createPrinterForContext,
  deletePrinterForOrg,
  findPrinterById,
  listPrintersForContext,
  updatePrinterForContext,
  type PrinterCreateInput,
  type PrinterUpdateInput,
} from "./printer-service";

export async function registerPrinterCrudRoutes(app: FastifyInstance) {
  app.get("/printers", async (request) => {
    const { orgId, locationId } = request.storeContext!;
    const rows = await listPrintersForContext(orgId, locationId);
    return { data: rows };
  });

  app.get<{ Params: { id: string } }>("/printers/:id", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const row = await findPrinterById(orgId, request.params.id);
    if (!row) return reply.status(404).send({ error: "Printer not found" });
    return row;
  });

  app.post<{
    Body: PrinterCreateInput;
  }>("/printers", async (request) => {
    const { orgId, locationId } = request.storeContext!;
    return createPrinterForContext({
      orgId,
      locationId,
      input: request.body,
    });
  });

  app.put<{
    Params: { id: string };
    Body: PrinterUpdateInput;
  }>("/printers/:id", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const updated = await updatePrinterForContext({
      orgId,
      locationId,
      printerId: request.params.id,
      input: request.body,
    });
    if (!updated) return reply.status(404).send({ error: "Printer not found" });
    return updated;
  });

  app.delete<{ Params: { id: string } }>(
    "/printers/:id",
    async (request, reply) => {
      const { orgId } = request.storeContext!;
      const deleted = await deletePrinterForOrg(orgId, request.params.id);
      if (!deleted)
        return reply.status(404).send({ error: "Printer not found" });
      return { success: true };
    },
  );
}
