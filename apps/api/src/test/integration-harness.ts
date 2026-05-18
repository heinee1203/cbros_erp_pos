import { resolve } from "node:path";
import type { TestContext } from "node:test";
import dotenv from "dotenv";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

dotenv.config({ path: resolve(process.cwd(), "../../.env") });
dotenv.config({ path: resolve(process.cwd(), ".env") });

export type ApiIntegrationHarness = {
  app: FastifyInstance;
  authHeaders: Record<string, string>;
  authHeadersFor: (role: string, userId?: string) => Record<string, string>;
  db: typeof import("@apex/database").db;
  ids: {
    locationId: string;
    orgId: string;
    userId: string;
  };
  schema: typeof import("@apex/database/schema");
};

export function getIntegrationDatabaseUrl() {
  return process.env.DATABASE_URL_TEST;
}

export function isSafeIntegrationDatabaseUrl(databaseUrl: string) {
  try {
    const dbName = new URL(databaseUrl).pathname.replace(/^\//, "").toLowerCase();
    return dbName.includes("test");
  } catch {
    return false;
  }
}

export async function createApiIntegrationHarness(t: TestContext): Promise<ApiIntegrationHarness | null> {
  const databaseUrl = getIntegrationDatabaseUrl();
  if (!databaseUrl) {
    t.skip("DATABASE_URL_TEST is not configured; skipping DB-backed integration test");
    return null;
  }

  if (!isSafeIntegrationDatabaseUrl(databaseUrl)) {
    throw new Error("DATABASE_URL_TEST must point to a database whose name includes 'test'");
  }

  process.env.DATABASE_URL = databaseUrl;
  process.env.JWT_SECRET ??= "integration-test-jwt-secret";
  process.env.NODE_ENV = "test";

  const [{ buildApp }, database, schema] = await Promise.all([
    import("../app"),
    import("@apex/database"),
    import("@apex/database/schema"),
  ]);
  const { db } = database;
  const maybeCloseDatabaseConnections = (
    database as typeof database & { closeDatabaseConnections?: () => Promise<void> }
  ).closeDatabaseConnections;
  const { locations, organizations, users } = schema;

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [org] = await db
    .insert(organizations)
    .values({
      name: `Integration Org ${suffix}`,
      slug: `integration-org-${suffix}`,
    })
    .returning();

  const [location] = await db
    .insert(locations)
    .values({
      orgId: org.id,
      name: "Integration Warehouse",
      code: `IT-${suffix.slice(-8)}`,
      type: "WAREHOUSE",
    })
    .returning();

  const [user] = await db
    .insert(users)
    .values({
      orgId: org.id,
      primaryLocationId: location.id,
      fullName: "Integration Admin",
      email: `integration-${suffix}@example.test`,
      passwordHash: "not-used-by-injected-tests",
      role: "ADMIN",
    })
    .returning();

  const app = await buildApp();
  const authHeadersFor = (role: string, userId = `${role.toLowerCase()}-${suffix}`) => {
    const token = app.jwt.sign({
      userId,
      orgId: org.id,
      role,
      primaryLocationId: location.id,
      permissions: [],
    });

    return {
      authorization: `Bearer ${token}`,
      "x-location-id": location.id,
    };
  };

  t.after(async () => {
    await app.close();
    await db.delete(organizations).where(eq(organizations.id, org.id));
    await maybeCloseDatabaseConnections?.();
  });

  return {
    app,
    authHeaders: authHeadersFor("ADMIN", user.id),
    authHeadersFor,
    db,
    ids: {
      locationId: location.id,
      orgId: org.id,
      userId: user.id,
    },
    schema,
  };
}
