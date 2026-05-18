import type { FastifyInstance } from "fastify";
import { paginationSchema } from "@apex/types";
import {
  queryHistoricalForProduct,
  queryJournal,
} from "./stock-journal-route-service";
import {
  canQueryStockJournalAcrossLocations,
  getStockJournalValidationError,
  mergeHistoricalStockJournalEntries,
  resolveHistoricalJournalLocationId,
  shouldIncludeHistoricalProductJournalEntries,
  shouldQueryAllStockJournalLocations,
  type StockJournalDirection,
  type StockJournalQuery,
} from "./stock-journal-route-helpers";

export async function registerStockJournalReadRoutes(app: FastifyInstance) {
  /**
   * GET /inventory/journal
   *
   * Paginated stock journal listing.
   * Default: scoped to the active location (X-Location-ID).
   * Pass allLocations=true (admin/manager) for cross-location view.
   */
  app.get("/", async (request, reply) => {
    const pageParsed = paginationSchema.safeParse(request.query);
    if (!pageParsed.success) {
      return reply.status(400).send({
        error: "Invalid pagination params",
        details: pageParsed.error.flatten(),
      });
    }

    const { cursor, limit } = pageParsed.data;
    const { orgId, locationId: defaultLocationId } = request.storeContext!;
    const userRole = request.user!.role;
    const q = request.query as StockJournalQuery;

    const allLocations = shouldQueryAllStockJournalLocations(
      q,
      defaultLocationId,
    );
    const locationId = q.locationId;
    const search = q.search;
    const referenceType = q.referenceType;
    const direction = q.direction as StockJournalDirection | undefined;
    const dateFrom = q.dateFrom;
    const dateTo = q.dateTo;
    const reasonCode = q.reasonCode;
    const productId = q.productId;

    const validationError = getStockJournalValidationError(q);
    if (validationError) {
      return reply.status(400).send({ error: validationError });
    }

    if (
      allLocations &&
      !canQueryStockJournalAcrossLocations(userRole as string)
    ) {
      return reply.status(403).send({
        error: "Cross-location journal access requires ADMIN or MANAGER role",
      });
    }

    const result = await queryJournal({
      orgId,
      defaultLocationId: defaultLocationId ?? "",
      allLocations,
      locationId,
      search,
      referenceType,
      direction,
      dateFrom,
      dateTo,
      reasonCode,
      productId,
      cursor,
      limit,
    });

    if (shouldIncludeHistoricalProductJournalEntries(productId, referenceType)) {
      const historical = await queryHistoricalForProduct(orgId, productId, {
        locationId: resolveHistoricalJournalLocationId(
          allLocations,
          locationId,
          defaultLocationId,
        ),
        dateFrom,
        dateTo,
        limit: limit || 50,
        variantProductId: q.variantProductId,
      });

      mergeHistoricalStockJournalEntries(result, historical, limit);
    }

    return reply.send(result);
  });
}
