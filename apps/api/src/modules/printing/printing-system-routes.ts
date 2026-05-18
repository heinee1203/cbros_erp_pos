import type { FastifyInstance } from "fastify";
import {
  listSystemPrinters,
  printZplToSystemPrinter,
} from "./printing-system-service";

export async function registerPrintingSystemRoutes(app: FastifyInstance) {
  app.get("/system-printers", async (_request, reply) => {
    try {
      return await listSystemPrinters();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return reply
        .status(500)
        .send({ error: `Failed to list printers: ${msg}` });
    }
  });

  app.post<{
    Body: { printerName: string; zpl: string };
  }>(
    "/system-print",
    {
      schema: {
        body: {
          type: "object",
          required: ["printerName", "zpl"],
          properties: {
            printerName: { type: "string", minLength: 1 },
            zpl: { type: "string", minLength: 1, maxLength: 500_000 },
          },
        },
      },
    },
    async (request, reply) => {
      const { printerName, zpl } = request.body;

      try {
        await printZplToSystemPrinter(printerName, zpl);
        return { success: true, printer: printerName };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        request.log.error({ err, printerName }, "System print failed");
        return reply.status(500).send({ error: `Print failed: ${msg}` });
      }
    },
  );
}
