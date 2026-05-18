import type { FastifyInstance } from "fastify";
import { registerPrinterCrudRoutes } from "./printer-crud-routes";
import { registerPrintingPreviewRoutes } from "./printing-preview-routes";
import { registerPrintingSystemRoutes } from "./printing-system-routes";
import { registerPrintingZplRoutes } from "./printing-zpl-routes";

export async function printingRoutes(app: FastifyInstance) {
  await registerPrinterCrudRoutes(app);
  await registerPrintingZplRoutes(app);
  await registerPrintingPreviewRoutes(app);
  await registerPrintingSystemRoutes(app);
}
