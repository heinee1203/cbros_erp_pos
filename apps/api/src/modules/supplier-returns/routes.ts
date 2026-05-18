import type { FastifyPluginAsync } from "fastify";
import { registerSupplierReturnDraftLineRoutes } from "./supplier-return-draft-line-routes";
import { registerSupplierReturnReadRoutes } from "./supplier-return-read-routes";
import { registerSupplierReturnWorkflowRoutes } from "./supplier-return-workflow-routes";

export const supplierReturnsRoutes: FastifyPluginAsync = async (app) => {
  await registerSupplierReturnReadRoutes(app);
  await registerSupplierReturnWorkflowRoutes(app);
  await registerSupplierReturnDraftLineRoutes(app);
};
