import type { FastifyInstance } from "fastify";
import { findPrinterById } from "./printer-service";
import { sendTcp } from "./printing-transport";
import { buildTestLabelZpl } from "./printing-zpl";

export async function registerPrintingZplRoutes(app: FastifyInstance) {
  app.post<{
    Body: { zpl: string; printerIp: string; port?: number };
  }>(
    "/zpl",
    {
      schema: {
        body: {
          type: "object",
          required: ["zpl", "printerIp"],
          properties: {
            zpl: { type: "string", minLength: 1, maxLength: 500_000 },
            printerIp: { type: "string", minLength: 1 },
            port: { type: "number", minimum: 1, maximum: 65535 },
          },
        },
      },
    },
    async (request, reply) => {
      const { zpl, printerIp, port = 9100 } = request.body;

      if (
        !/^[\d.]+$/.test(printerIp) &&
        !/^[a-zA-Z0-9.-]+$/.test(printerIp)
      ) {
        return reply
          .status(400)
          .send({ error: "Invalid printer IP/hostname" });
      }

      try {
        await sendTcp(printerIp, port, zpl);
        return { success: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        request.log.error({ err, printerIp, port }, "ZPL print failed");
        return reply
          .status(502)
          .send({ error: `Printer connection failed: ${msg}` });
      }
    },
  );

  app.post<{
    Body: { zpl: string; printerId: string };
  }>(
    "/zpl/send",
    {
      schema: {
        body: {
          type: "object",
          required: ["zpl", "printerId"],
          properties: {
            zpl: { type: "string", minLength: 1, maxLength: 500_000 },
            printerId: { type: "string", minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const { orgId } = request.storeContext!;
      const { zpl, printerId } = request.body;

      const printer = await findPrinterById(orgId, printerId);
      if (!printer) {
        return reply.status(404).send({ error: "Printer not found" });
      }

      if (printer.connectionType !== "tcp") {
        return reply.status(400).send({
          error: `Printer "${printer.name}" uses ${printer.connectionType} — only TCP printing is supported from the server`,
        });
      }

      if (!printer.ipAddress) {
        return reply
          .status(400)
          .send({ error: "Printer has no IP address configured" });
      }

      try {
        await sendTcp(printer.ipAddress, printer.port ?? 9100, zpl);
        return { success: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        request.log.error(
          { err, printerId, ip: printer.ipAddress },
          "ZPL print failed",
        );
        return reply
          .status(502)
          .send({ error: `Printer connection failed: ${msg}` });
      }
    },
  );

  app.post<{
    Body: { printerIp: string; port?: number };
  }>(
    "/zpl/test",
    {
      schema: {
        body: {
          type: "object",
          required: ["printerIp"],
          properties: {
            printerIp: { type: "string", minLength: 1 },
            port: { type: "number", minimum: 1, maximum: 65535 },
          },
        },
      },
    },
    async (request, reply) => {
      const { printerIp, port = 9100 } = request.body;
      const testZPL = buildTestLabelZpl();

      try {
        await sendTcp(printerIp, port, testZPL);
        return { success: true, message: "Test label sent" };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        return reply
          .status(502)
          .send({ error: `Printer connection failed: ${msg}` });
      }
    },
  );
}
