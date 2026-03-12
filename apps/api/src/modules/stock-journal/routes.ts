import type { FastifyPluginAsync } from "fastify";
import { paginationSchema } from "@apex/types";
import { UserRole } from "@apex/types";
import { queryJournal } from "./service";

/** Roles allowed to query across all locations */
const CROSS_LOCATION_ROLES = [UserRole.ADMIN, UserRole.MANAGER];

const VALID_REFERENCE_TYPES = [
  "SALE",
  "RECEIVING",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "ADJUSTMENT",
  "RETURN",
  "STOCKTAKE",
  "VOID",
  "JOB_CARD_ISSUE",
  "JOB_CARD_RETURN",
  "OPENING_BALANCE",
];

const VALID_REASON_CODES = [
  "COUNT_GAIN",
  "FOUND_STOCK",
  "OPENING_BALANCE",
  "COUNT_LOSS",
  "DAMAGE_IN_TRANSIT",
  "DAMAGE_WAREHOUSE",
  "DAMAGE_SHOWROOM",
  "WARRANTY_WRITE_OFF",
  "SHRINKAGE_MISSING",
  "OBSOLETE_WRITE_OFF",
  "TRANSFER_SHORTAGE_CONFIRMED",
  "DATA_CORRECTION",
];

export const stockJournalRoutes: FastifyPluginAsync = async (app) => {
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

    // ── Parse optional query params ──
    const q = request.query as Record<string, string | undefined>;

    const allLocations = q.allLocations === "true";
    const locationId = q.locationId;
    const search = q.search;
    const referenceType = q.referenceType;
    const direction = q.direction as "IN" | "OUT" | undefined;
    const dateFrom = q.dateFrom;
    const dateTo = q.dateTo;
    const reasonCode = q.reasonCode;
    const productId = q.productId;

    // ── Validate enum values ──
    if (referenceType && !VALID_REFERENCE_TYPES.includes(referenceType)) {
      return reply.status(400).send({ error: `Invalid referenceType: ${referenceType}` });
    }
    if (direction && direction !== "IN" && direction !== "OUT") {
      return reply.status(400).send({ error: `Invalid direction: ${direction}` });
    }
    if (reasonCode && !VALID_REASON_CODES.includes(reasonCode)) {
      return reply.status(400).send({ error: `Invalid reasonCode: ${reasonCode}` });
    }

    // ── Cross-location guard ──
    if (allLocations && !CROSS_LOCATION_ROLES.includes(userRole as any)) {
      return reply.status(403).send({
        error: "Cross-location journal access requires ADMIN or MANAGER role",
      });
    }

    const result = await queryJournal({
      orgId,
      defaultLocationId,
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

    return reply.send(result);
  });
};
