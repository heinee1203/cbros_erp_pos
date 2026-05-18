import type { FastifyPluginAsync } from "fastify";
import { registerStockJournalReadRoutes } from "./stock-journal-read-routes";

export const stockJournalRoutes: FastifyPluginAsync = async (app) => {
  await registerStockJournalReadRoutes(app);
};
