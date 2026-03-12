import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

// For query usage (app runtime) — limited pool
const queryClient = postgres(connectionString, { max: 10 });
export const db = drizzle(queryClient, { schema });

// For migrations / seed (single connection, then close)
export function createMigrationClient() {
  const migrationClient = postgres(connectionString!, { max: 1 });
  return drizzle(migrationClient, { schema });
}

export { schema };
export type Database = typeof db;

/**
 * Transaction-compatible DB client type.
 * Uses a structural Pick type so helper functions accept both `db` and
 * `tx` inside db.transaction() with full autocomplete and type checking.
 */
export type DbOrTx = Pick<typeof db, "select" | "insert" | "update" | "delete" | "execute">;
