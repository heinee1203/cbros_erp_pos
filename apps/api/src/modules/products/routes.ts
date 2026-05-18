import type { FastifyPluginAsync } from "fastify";
import { registerProductListRoutes } from "./list-routes";
import { registerProductFamilyRoutes } from "./families-routes";
import { registerProductVehicleRoutes } from "./vehicles-routes";
import { registerProductBulkRoutes } from "./bulk-routes";
import { registerProductImportExportRoutes } from "./import-export-routes";
import { registerProductPendingRoutes } from "./pending-routes";
import { registerProductBarcodeRoutes, registerProductDetailReadRoutes, registerProductSearchRoutes } from "./read-routes";
import { registerProductCreateRoutes } from "./create-routes";
import { registerProductDeleteRoutes, registerProductUpdateRoutes } from "./mutation-routes";
import { registerProductGroupedCountRoutes } from "./grouped-counts-routes";

export const productRoutes: FastifyPluginAsync = async (app) => {
  // Auth is handled globally by the auth plugin; no per-route hook needed.

  registerProductListRoutes(app);
  registerProductSearchRoutes(app);
  registerProductCreateRoutes(app);
  registerProductBulkRoutes(app);
  registerProductUpdateRoutes(app);
  registerProductGroupedCountRoutes(app);
  registerProductDetailReadRoutes(app);
  registerProductDeleteRoutes(app);
  registerProductBarcodeRoutes(app);
  registerProductFamilyRoutes(app);
  registerProductVehicleRoutes(app);
  registerProductImportExportRoutes(app);
  registerProductPendingRoutes(app);
};
