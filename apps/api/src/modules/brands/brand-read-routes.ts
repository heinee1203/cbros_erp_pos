import type { FastifyInstance } from "fastify";
import { listBrands } from "./brand-route-service";

export async function registerBrandReadRoutes(app: FastifyInstance) {
  app.get("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const query = request.query as Record<string, string | undefined>;

    const result = await listBrands({
      orgId,
      search: query.search,
    });

    return reply.send({ data: result });
  });
}
