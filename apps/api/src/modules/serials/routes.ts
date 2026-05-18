import type { FastifyPluginAsync } from "fastify";
import { registerSerialReadRoutes } from "./serial-read-routes";
import { registerSerialReportRoutes } from "./serial-report-routes";
import { registerSerialWriteRoutes } from "./serial-write-routes";

export const serialRoutes: FastifyPluginAsync = async (app) => {
  await registerSerialReadRoutes(app);
  await registerSerialWriteRoutes(app);
  await registerSerialReportRoutes(app);
};
