import { z } from "zod";
import type { FastifyReply } from "fastify";

export function parseQuery<T extends z.ZodType>(
  schema: T,
  query: unknown,
  reply: FastifyReply,
): z.infer<T> | null {
  const parsed = schema.safeParse(query);
  if (!parsed.success) {
    reply.status(400).send({
      error: "Invalid query parameters",
      details: parsed.error.flatten(),
    });
    return null;
  }
  return parsed.data;
}

export function parseBody<T extends z.ZodType>(
  schema: T,
  body: unknown,
  reply: FastifyReply,
): z.infer<T> | null {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    reply.status(400).send({
      error: "Validation failed",
      details: parsed.error.flatten(),
    });
    return null;
  }
  return parsed.data;
}

// ── Shared query schemas ────────────────────────────────────

const isoDatetime = z.string().datetime({ offset: true }).optional();
const optionalUuid = z.string().uuid().optional();

export const salesQuerySchema = z.object({
  from: isoDatetime,
  to: isoDatetime,
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: optionalUuid,
  q: z.string().optional(),
  allLocations: z.enum(["true", "false"]).optional(),
});
export type SalesQuery = z.infer<typeof salesQuerySchema>;

export const shiftsQuerySchema = z.object({
  from: isoDatetime,
  to: isoDatetime,
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: optionalUuid,
  userId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  allLocations: z.enum(["true", "false"]).optional(),
});
export type ShiftsQuery = z.infer<typeof shiftsQuerySchema>;

export const syncQuerySchema = z.object({
  since: isoDatetime,
  cursor: optionalUuid,
  limit: z.coerce.number().int().min(1).max(1000).default(500),
});
export type SyncQuery = z.infer<typeof syncQuerySchema>;
