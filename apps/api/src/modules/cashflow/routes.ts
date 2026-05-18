import type { FastifyPluginAsync } from "fastify";
import { registerCashflowExpenseRoutes } from "./cashflow-expense-routes";
import { registerCashflowForecastRoutes } from "./cashflow-forecast-routes";

export const cashflowRoutes: FastifyPluginAsync = async (app) => {
  await registerCashflowForecastRoutes(app);
  await registerCashflowExpenseRoutes(app);
};
