import type { FastifyPluginAsync } from "fastify";
import { registerBankAccountRoutes } from "./bank-account-routes";
import { registerCheckVoucherRoutes } from "./check-voucher-routes";
import { registerDisbursementVoucherRoutes } from "./disbursement-voucher-routes";
import { registerSupplierInvoiceRoutes } from "./invoice-routes";
import { registerReportCheckRegisterRoutes } from "./report-check-register-routes";
import { registerSupplierRoutes } from "./supplier-routes";
import { registerSupplierSoaRoutes } from "./supplier-soa-routes";

export const accountsPayableRoutes: FastifyPluginAsync = async (app) => {
  registerSupplierInvoiceRoutes(app);
  registerCheckVoucherRoutes(app);
  registerSupplierSoaRoutes(app);
  registerDisbursementVoucherRoutes(app);
  registerSupplierRoutes(app);
  registerReportCheckRegisterRoutes(app);
  registerBankAccountRoutes(app);
};
