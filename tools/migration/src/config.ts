import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load .env from monorepo root (3 levels up from src/)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@apex/database/schema";

// ── Database connection ──
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

const queryClient = postgres(connectionString, { max: 5 });
export const db = drizzle(queryClient, { schema });

// ── Migration config ──
export const DATA_DIR = path.resolve(__dirname, "../data");

export const BATCH_SIZE = 500; // rows per INSERT batch

export const VALID_CATEGORIES = [
  "TIRES",
  "LUBRICANTS",
  "HARD_PARTS",
  "ACCESSORIES",
  "LABOR_SERVICES",
] as const;

export const VALID_LOCATION_TYPES = [
  "WAREHOUSE",
  "RETAIL_STORE",
  "SHOWROOM",
  "STORE",
  "TRANSIT_BUFFER",
] as const;

/** Target org ID — set via ORG_ID env var or discovered from DB */
export async function getOrgId(): Promise<string> {
  if (process.env.ORG_ID) return process.env.ORG_ID;

  // Auto-discover first org
  const rows = await db.execute(
    /* sql */ `SELECT id FROM organizations LIMIT 1`,
  );
  if (rows.length === 0) {
    throw new Error("No organizations found. Please set ORG_ID or seed the database first.");
  }
  const orgId = (rows[0] as any).id;
  console.log(`  Auto-discovered org: ${orgId}`);
  return orgId;
}

export async function closeDb() {
  await queryClient.end();
}
