import type { FastifyPluginAsync } from "fastify";
import { registerWarrantyClaimRoutes } from "./warranty-claim-routes";
import { registerWarrantyPolicyRoutes } from "./warranty-policy-routes";
import { registerWarrantyRecordRoutes } from "./warranty-record-routes";

export const warrantyRoutes: FastifyPluginAsync = async (app) => {
  await registerWarrantyPolicyRoutes(app);
  await registerWarrantyRecordRoutes(app);
  await registerWarrantyClaimRoutes(app);
};
