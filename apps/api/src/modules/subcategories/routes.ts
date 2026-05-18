import type { FastifyPluginAsync } from "fastify";
import { registerSubcategoryMutationRoutes } from "./subcategory-mutation-routes";
import { registerSubcategoryReadRoutes } from "./subcategory-read-routes";

export const subcategoryRoutes: FastifyPluginAsync = async (app) => {
  await registerSubcategoryReadRoutes(app);
  await registerSubcategoryMutationRoutes(app);
};
