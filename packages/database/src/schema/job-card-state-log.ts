import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { jobCards, jobCardStatusEnum } from "./job-cards";
import { users } from "./users";

// ── Job Card State Log ──
// Immutable event-sourced ledger of every state transition.
// Used for fair technician efficiency metrics and cycle time analysis.

export const jobCardStateLog = pgTable(
  "job_card_state_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    jobCardId: uuid("job_card_id")
      .notNull()
      .references(() => jobCards.id, { onDelete: "cascade" }),
    fromStatus: jobCardStatusEnum("from_status"), // NULL for initial creation
    toStatus: jobCardStatusEnum("to_status").notNull(),
    transitionedByUserId: uuid("transitioned_by_user_id").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    notes: varchar("notes", { length: 500 }),
    transitionedAt: timestamp("transitioned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Immutable ledger — no updated_at
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_jcsl_job_card").on(table.jobCardId),
    index("idx_jcsl_org_status").on(table.orgId, table.toStatus),
    index("idx_jcsl_transitioned_at").on(table.transitionedAt),
    index("idx_jcsl_user").on(table.transitionedByUserId),
  ],
);
