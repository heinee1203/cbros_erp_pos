import type { FastifyPluginAsync } from "fastify";
import { registerCustomerCollectionRoutes } from "./customer-collection-routes";
import { registerCustomerLedgerListRoutes } from "./customer-ledger-list-routes";
import { registerCustomerMemberRoutes } from "./customer-member-routes";
import { registerCustomerReportRoutes } from "./customer-report-routes";
import { registerCustomerSearchRoutes } from "./customer-search-routes";
import { registerCustomerSoaRoutes } from "./customer-soa-routes";
import { registerCustomerTransactionRoutes } from "./customer-transaction-routes";
import { registerCustomerVehicleRoutes } from "./customer-vehicle-routes";

export const customerRoutes: FastifyPluginAsync = async (app) => {
  registerCustomerSearchRoutes(app);
  registerCustomerReportRoutes(app);
  registerCustomerCollectionRoutes(app);
  registerCustomerLedgerListRoutes(app);
  registerCustomerMemberRoutes(app);
  registerCustomerTransactionRoutes(app);
  registerCustomerVehicleRoutes(app);
  registerCustomerSoaRoutes(app);
};
