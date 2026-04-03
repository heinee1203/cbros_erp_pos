import { db } from "@apex/database";
import {
  notifications,
  notificationSettings,
  users,
  inventory,
  products,
  saleLines,
  sales,
  locations,
} from "@apex/database/schema";
import { eq, and, or, isNull, sql, desc, gte, lt, asc, type SQL } from "drizzle-orm";

// ── Types ──

export type NotificationType =
  | "STOCKOUT"
  | "LOW_STOCK_DIGEST"
  | "PO_RECEIVED"
  | "TRANSFER_COMPLETED"
  | "BACKORDER_AGING"
  | "SYSTEM";

export type NotificationPriority = "CRITICAL" | "URGENT" | "NORMAL" | "INFO";

interface CreateNotificationInput {
  orgId: string;
  userId?: string | null;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  body?: string;
  link?: string;
  referenceType?: string;
  referenceId?: string;
}

// ── Core CRUD ──

/**
 * Create a notification with deduplication.
 * If an unread notification for the same referenceId+type exists and is <24h old, skip.
 */
export async function createNotification(
  input: CreateNotificationInput,
): Promise<boolean> {
  // Deduplication check
  if (input.referenceId && input.type) {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existing = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.orgId, input.orgId),
          eq(notifications.referenceId, input.referenceId),
          eq(notifications.type, input.type),
          eq(notifications.isRead, false),
          gte(notifications.createdAt, cutoff),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      return false; // Deduplicated — skip
    }
  }

  await db.insert(notifications).values({
    orgId: input.orgId,
    userId: input.userId ?? null,
    type: input.type,
    priority: input.priority,
    title: input.title,
    body: input.body ?? null,
    link: input.link ?? null,
    referenceType: input.referenceType ?? null,
    referenceId: input.referenceId ?? null,
  });

  return true;
}

/**
 * Get unread notification count for a user.
 * Includes org-wide notifications (userId IS NULL) and user-specific ones.
 */
export async function getUnreadCount(
  orgId: string,
  userId: string,
): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(notifications)
    .where(
      and(
        eq(notifications.orgId, orgId),
        or(eq(notifications.userId, userId), isNull(notifications.userId)),
        eq(notifications.isRead, false),
      ),
    );
  return result?.count ?? 0;
}

/**
 * List notifications for a user with cursor-based pagination.
 */
export async function listNotifications(
  orgId: string,
  userId: string,
  opts: {
    cursor?: string;
    limit?: number;
    type?: string;
    isRead?: boolean;
  } = {},
) {
  const limit = opts.limit ?? 20;
  const conditions: SQL[] = [
    eq(notifications.orgId, orgId),
    or(eq(notifications.userId, userId), isNull(notifications.userId)),
  ];

  if (opts.type) {
    conditions.push(eq(notifications.type, opts.type as any));
  }
  if (opts.isRead !== undefined) {
    conditions.push(eq(notifications.isRead, opts.isRead));
  }
  if (opts.cursor) {
    conditions.push(sql`${notifications.id} < ${opts.cursor}`);
  }

  const rows = await db
    .select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  return { data, nextCursor, hasMore };
}

/**
 * Mark a single notification as read.
 */
export async function markRead(
  id: string,
  orgId: string,
  userId: string,
): Promise<void> {
  await db
    .update(notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(
      and(
        eq(notifications.id, id),
        eq(notifications.orgId, orgId),
        or(eq(notifications.userId, userId), isNull(notifications.userId)),
      ),
    );
}

/**
 * Mark all unread notifications as read for a user.
 */
export async function markAllRead(
  orgId: string,
  userId: string,
): Promise<void> {
  await db
    .update(notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(
      and(
        eq(notifications.orgId, orgId),
        or(eq(notifications.userId, userId), isNull(notifications.userId)),
        eq(notifications.isRead, false),
      ),
    );
}

/**
 * Delete a notification.
 */
export async function deleteNotification(
  id: string,
  orgId: string,
  userId: string,
): Promise<void> {
  await db
    .delete(notifications)
    .where(
      and(
        eq(notifications.id, id),
        eq(notifications.orgId, orgId),
        or(eq(notifications.userId, userId), isNull(notifications.userId)),
      ),
    );
}

/**
 * Delete notifications older than N days.
 */
export async function deleteOldNotifications(
  orgId: string,
  daysOld: number = 90,
): Promise<number> {
  const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
  const result = await db
    .delete(notifications)
    .where(
      and(
        eq(notifications.orgId, orgId),
        lt(notifications.createdAt, cutoff),
      ),
    )
    .returning({ id: notifications.id });
  return result.length;
}

// ── Notification Settings ──

/**
 * Get or create default notification settings for a user.
 */
export async function getSettings(orgId: string, userId: string) {
  const [existing] = await db
    .select()
    .from(notificationSettings)
    .where(
      and(
        eq(notificationSettings.orgId, orgId),
        eq(notificationSettings.userId, userId),
      ),
    )
    .limit(1);

  if (existing) return existing;

  // Create default settings
  const [created] = await db
    .insert(notificationSettings)
    .values({ orgId, userId })
    .onConflictDoNothing()
    .returning();

  // If conflict (race condition), re-read
  if (!created) {
    const [row] = await db
      .select()
      .from(notificationSettings)
      .where(
        and(
          eq(notificationSettings.orgId, orgId),
          eq(notificationSettings.userId, userId),
        ),
      )
      .limit(1);
    return row;
  }

  return created;
}

/**
 * Update notification settings for a user.
 */
export async function updateSettings(
  orgId: string,
  userId: string,
  updates: {
    dailyDigestEnabled?: boolean;
    dailyDigestTime?: string;
    stockoutEmailEnabled?: boolean;
    stockoutInappEnabled?: boolean;
    lowStockThreshold?: string;
    emailAddress?: string | null;
  },
) {
  // Ensure row exists first
  await getSettings(orgId, userId);

  const [updated] = await db
    .update(notificationSettings)
    .set(updates)
    .where(
      and(
        eq(notificationSettings.orgId, orgId),
        eq(notificationSettings.userId, userId),
      ),
    )
    .returning();

  return updated;
}

// ── Stock Alert Triggers ──

/**
 * Check if a product just hit zero stock and notify if it has recent demand.
 * Fire-and-forget: should be called AFTER the transaction commits.
 */
export async function checkAndNotifyStockout(
  orgId: string,
  productId: string,
  productName: string,
  locationName: string,
  newStockLevel: number,
) {
  try {
    if (newStockLevel > 0) return;

    // Check recent demand — skip dead stock items
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const [demandCheck] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(saleLines)
      .innerJoin(sales, eq(sales.id, saleLines.saleId))
      .where(
        and(
          eq(saleLines.productId, productId),
          eq(sales.orgId, orgId),
          sql`${sales.status} = 'COMPLETED'`,
          gte(sales.createdAt, ninetyDaysAgo),
        ),
      );

    if ((demandCheck?.count ?? 0) === 0) return; // Dead stock, don't alert

    await createNotification({
      orgId,
      type: "STOCKOUT",
      priority: "CRITICAL",
      title: `${productName} hit zero stock`,
      body: `Stock at ${locationName} is now 0. This item has recent sales activity.`,
      link: "/procurement/suggested-orders",
      referenceType: "product",
      referenceId: productId,
    });
  } catch (err) {
    // Never let notification errors bubble up to the caller
    console.error("[NOTIFICATION] Error creating stockout alert:", err);
  }
}

/**
 * Check if a product dropped below its reorder point and notify.
 * Fire-and-forget: should be called AFTER the transaction commits.
 */
export async function checkAndNotifyLowStock(
  orgId: string,
  productId: string,
  productName: string,
  locationName: string,
  newStockLevel: number,
  reorderPoint: number,
) {
  try {
    if (newStockLevel <= 0) return; // Handled by stockout check
    if (newStockLevel > reorderPoint) return; // Above reorder point

    await createNotification({
      orgId,
      type: "STOCKOUT", // Same type for deduplication
      priority: "URGENT",
      title: `${productName} is low at ${locationName}`,
      body: `Stock: ${newStockLevel} (reorder point: ${reorderPoint})`,
      link: "/procurement/suggested-orders",
      referenceType: "product",
      referenceId: productId,
    });
  } catch (err) {
    console.error("[NOTIFICATION] Error creating low-stock alert:", err);
  }
}

// ── Daily Digest ──

/**
 * Generate the daily low-stock digest.
 * Creates one notification per admin/manager and logs the email body.
 */
export async function generateDailyDigest(orgId: string) {
  // 1. Query all items below reorder point
  const lowStockItems = await db
    .select({
      productId: products.id,
      productName: products.name,
      sku: products.sku,
      stockLevel: inventory.stockLevel,
      reorderPoint: inventory.reorderPoint,
      locationName: locations.name,
    })
    .from(inventory)
    .innerJoin(products, eq(products.id, inventory.productId))
    .innerJoin(locations, eq(locations.id, inventory.locationId))
    .where(
      and(
        eq(products.orgId, orgId),
        eq(products.isActive, true),
        sql`${inventory.stockLevel} <= ${inventory.reorderPoint}`,
      ),
    )
    .orderBy(asc(inventory.stockLevel));

  if (lowStockItems.length === 0) {
    console.log("[DIGEST] No items below reorder point — skipping digest");
    return { itemCount: 0, recipientCount: 0 };
  }

  // 2. Categorize
  const critical = lowStockItems.filter((i) => i.stockLevel === 0);
  const urgent = lowStockItems.filter(
    (i) => i.stockLevel > 0 && i.stockLevel <= Math.ceil(i.reorderPoint / 2),
  );
  const normal = lowStockItems.filter(
    (i) => i.stockLevel > Math.ceil(i.reorderPoint / 2),
  );

  // 3. Build digest text
  const lines: string[] = [
    `${lowStockItems.length} items are below their reorder point:`,
    "",
  ];

  if (critical.length > 0) {
    lines.push(`CRITICAL (${critical.length} items — zero stock)`);
    critical.slice(0, 5).forEach((i) => {
      lines.push(
        `  • ${i.productName} — 0 in stock at ${i.locationName} (reorder: ${i.reorderPoint})`,
      );
    });
    if (critical.length > 5) lines.push(`  ... and ${critical.length - 5} more`);
    lines.push("");
  }

  if (urgent.length > 0) {
    lines.push(`URGENT (${urgent.length} items — running low)`);
    urgent.slice(0, 5).forEach((i) => {
      lines.push(
        `  • ${i.productName} — ${i.stockLevel} in stock (reorder: ${i.reorderPoint})`,
      );
    });
    if (urgent.length > 5) lines.push(`  ... and ${urgent.length - 5} more`);
    lines.push("");
  }

  if (normal.length > 0) {
    lines.push(`NORMAL (${normal.length} items — below reorder point)`);
    lines.push("");
  }

  const digestBody = lines.join("\n");
  const digestTitle = `Daily stock report: ${lowStockItems.length} items need reordering`;

  // 4. Find all admin/manager users in the org
  const admins = await db
    .select({ id: users.id, email: users.email, fullName: users.fullName })
    .from(users)
    .where(
      and(
        eq(users.orgId, orgId),
        sql`${users.role} IN ('ADMIN', 'MANAGER')`,
      ),
    );

  // 5. Create notification for each recipient
  for (const admin of admins) {
    await db.insert(notifications).values({
      orgId,
      userId: admin.id,
      type: "LOW_STOCK_DIGEST",
      priority: critical.length > 0 ? "CRITICAL" : urgent.length > 0 ? "URGENT" : "NORMAL",
      title: digestTitle,
      body: digestBody,
      link: "/procurement/suggested-orders",
    });

    // Log email (v1 — future: swap in real email provider)
    sendEmail(
      admin.email,
      `CBROS Autoparts — ${digestTitle}`,
      digestBody,
    );
  }

  // 6. Cleanup old notifications
  const deletedCount = await deleteOldNotifications(orgId, 90);
  if (deletedCount > 0) {
    console.log(`[DIGEST] Cleaned up ${deletedCount} notifications older than 90 days`);
  }

  return {
    itemCount: lowStockItems.length,
    recipientCount: admins.length,
    critical: critical.length,
    urgent: urgent.length,
    normal: normal.length,
  };
}

// ── Email (v1 = console log) ──

function sendEmail(to: string, subject: string, body: string): boolean {
  console.log(`\n[EMAIL] ═══════════════════════════════════════`);
  console.log(`[EMAIL] To: ${to}`);
  console.log(`[EMAIL] Subject: ${subject}`);
  console.log(`[EMAIL] ───────────────────────────────────────`);
  console.log(body);
  console.log(`[EMAIL] ═══════════════════════════════════════\n`);
  return true;
}
