import { db } from "@apex/database";
import { auditLogs } from "@apex/database/schema";
import { eq, and, sql, desc } from "drizzle-orm";

export interface LogActionParams {
  orgId: string;
  userId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

/**
 * Fire-and-forget audit log entry.
 * Never throws — logging failure should not break business logic.
 */
export function logAction(params: LogActionParams): void {
  db.insert(auditLogs)
    .values({
      orgId: params.orgId,
      userId: params.userId ?? null,
      action: params.action,
      entityType: params.entityType ?? null,
      entityId: params.entityId ?? null,
      details: params.details ?? null,
      ipAddress: params.ipAddress ?? null,
    })
    .execute()
    .catch((err) => {
      console.error("[audit] Failed to log action:", err.message);
    });
}

export interface AuditQueryParams {
  orgId: string;
  userId?: string;
  action?: string;
  entityType?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

export interface AuditLogRow {
  id: string;
  userId: string | null;
  userName: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  details: unknown;
  ipAddress: string | null;
  createdAt: string;
}

export async function queryAuditLog(params: AuditQueryParams): Promise<{
  data: AuditLogRow[];
  nextCursor: string | null;
  hasMore: boolean;
}> {
  const limit = params.limit ?? 50;
  const conditions = [eq(auditLogs.orgId, params.orgId)];

  if (params.userId) {
    conditions.push(eq(auditLogs.userId, params.userId));
  }
  if (params.action) {
    conditions.push(eq(auditLogs.action, params.action));
  }
  if (params.entityType) {
    conditions.push(eq(auditLogs.entityType, params.entityType));
  }
  if (params.from) {
    conditions.push(sql`${auditLogs.createdAt} >= ${params.from}`);
  }
  if (params.to) {
    conditions.push(sql`${auditLogs.createdAt} <= ${params.to}`);
  }
  if (params.cursor) {
    conditions.push(sql`${auditLogs.id} < ${params.cursor}`);
  }

  const rows = await db.execute(sql`
    SELECT
      al.id,
      al.user_id,
      u.name AS user_name,
      al.action,
      al.entity_type,
      al.entity_id,
      al.details,
      al.ip_address,
      al.created_at
    FROM audit_logs al
    LEFT JOIN users u ON u.id = al.user_id
    WHERE ${and(...conditions)}
    ORDER BY al.created_at DESC, al.id DESC
    LIMIT ${limit + 1}
  `);

  const hasMore = (rows as any[]).length > limit;
  const data = hasMore ? (rows as any[]).slice(0, limit) : (rows as any[]);
  const nextCursor = hasMore ? data[data.length - 1]!.id : null;

  return {
    data: data.map((r: any) => ({
      id: r.id,
      userId: r.user_id,
      userName: r.user_name,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      details: r.details,
      ipAddress: r.ip_address,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    })),
    nextCursor,
    hasMore,
  };
}
