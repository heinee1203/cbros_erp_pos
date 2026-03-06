# Phase 1: ERP Backbone Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Scaffold a pnpm monorepo with a Fastify API, Drizzle/PostgreSQL database, JWT auth, store-context middleware, and a 50k-product seed — all verified end-to-end.

**Architecture:** pnpm workspace monorepo. `apps/api` is a Fastify modular monolith (each feature is a Fastify plugin). `packages/database` owns Drizzle schemas and migrations. `packages/types` exports shared enums and Zod schemas. Local Postgres via Docker Compose. Shared DB multi-tenancy filtered by `org_id`.

**Tech Stack:** Node.js 20+, TypeScript 5.9, Fastify 5, Drizzle ORM 0.45, PostgreSQL 16, Zod 4, pnpm, Docker Compose, Render.

---

## Task 1: Root Workspace Scaffolding

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `.env`

**Step 1: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

**Step 2: Create root `package.json`**

```json
{
  "name": "apex-pos",
  "private": true,
  "scripts": {
    "dev": "pnpm --filter @apex/api dev",
    "build": "pnpm --filter @apex/api build",
    "db:generate": "pnpm --filter @apex/database generate",
    "db:migrate": "pnpm --filter @apex/database migrate",
    "db:seed": "pnpm --filter @apex/database seed",
    "db:studio": "pnpm --filter @apex/database studio",
    "typecheck": "tsc --build",
    "clean": "rm -rf apps/*/dist packages/*/dist"
  },
  "devDependencies": {
    "typescript": "^5.9.3"
  },
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=9.0.0"
  }
}
```

**Step 3: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "exclude": ["node_modules", "dist"]
}
```

**Step 4: Create `.gitignore`**

```
node_modules/
dist/
.env
*.log
.DS_Store
.turbo
```

**Step 5: Create `.env.example` and `.env`**

```env
DATABASE_URL=postgresql://apex:apex_secret@localhost:5432/apex_dev
JWT_SECRET=change-me-in-production-use-a-64-char-random-string
PORT=3000
NODE_ENV=development
```

Copy `.env.example` to `.env` (identical content for local dev).

**Step 6: Run `pnpm install` to generate lockfile**

Run: `pnpm install`
Expected: Creates `pnpm-lock.yaml`, installs typescript.

**Step 7: Commit**

```bash
git add pnpm-workspace.yaml package.json tsconfig.base.json .gitignore .env.example
git commit -m "chore: scaffold root pnpm workspace with shared tsconfig"
```

> Do NOT commit `.env` — it is in `.gitignore`.

---

## Task 2: Docker Compose + Render Blueprint

**Files:**
- Create: `docker-compose.yml`
- Create: `render.yaml`

**Step 1: Create `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: apex-postgres
    restart: unless-stopped
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: apex
      POSTGRES_PASSWORD: apex_secret
      POSTGRES_DB: apex_dev
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U apex -d apex_dev"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  pgdata:
```

**Step 2: Create `render.yaml`**

```yaml
databases:
  - name: apex-db
    plan: starter
    databaseName: apex_prod
    user: apex

services:
  - name: apex-api
    plan: starter
    type: web
    runtime: node
    buildCommand: pnpm install --frozen-lockfile && pnpm build
    startCommand: node apps/api/dist/server.js
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: apex-db
          property: connectionString
      - key: JWT_SECRET
        generateValue: true
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 3000
```

**Step 3: Start Postgres and verify**

Run: `docker compose up -d`
Expected: `apex-postgres` container running, healthy.

Run: `docker compose ps`
Expected: Shows postgres service as "Up" and healthy.

**Step 4: Commit**

```bash
git add docker-compose.yml render.yaml
git commit -m "infra: add Docker Compose for local Postgres and Render blueprint"
```

---

## Task 3: `packages/types` — Shared Enums & Zod Schemas

**Files:**
- Create: `packages/types/package.json`
- Create: `packages/types/tsconfig.json`
- Create: `packages/types/src/enums.ts`
- Create: `packages/types/src/schemas.ts`
- Create: `packages/types/src/index.ts`

**Step 1: Create `packages/types/package.json`**

```json
{
  "name": "@apex/types",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "typescript": "^5.9.3"
  }
}
```

> **Note on Zod version:** Use Zod v3 (not v4) because `drizzle-zod` only supports Zod v3 as of March 2026. The `^3.24.0` range gets us the latest Zod 3.x.

**Step 2: Create `packages/types/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

**Step 3: Create `packages/types/src/enums.ts`**

```typescript
export const LocationType = {
  WAREHOUSE: "WAREHOUSE",
  RETAIL_STORE: "RETAIL_STORE",
} as const;
export type LocationType = (typeof LocationType)[keyof typeof LocationType];

export const UserRole = {
  ADMIN: "ADMIN",
  MANAGER: "MANAGER",
  CASHIER: "CASHIER",
  WAREHOUSE_STAFF: "WAREHOUSE_STAFF",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const ProductCategory = {
  TIRES: "TIRES",
  LUBRICANTS: "LUBRICANTS",
  HARD_PARTS: "HARD_PARTS",
  ACCESSORIES: "ACCESSORIES",
  LABOR_SERVICES: "LABOR_SERVICES",
} as const;
export type ProductCategory =
  (typeof ProductCategory)[keyof typeof ProductCategory];

export const TransferStatus = {
  DRAFT: "DRAFT",
  PENDING: "PENDING",
  IN_TRANSIT: "IN_TRANSIT",
  RECEIVED: "RECEIVED",
  CANCELLED: "CANCELLED",
} as const;
export type TransferStatus =
  (typeof TransferStatus)[keyof typeof TransferStatus];
```

**Step 4: Create `packages/types/src/schemas.ts`**

```typescript
import { z } from "zod";
import { LocationType, UserRole, ProductCategory, TransferStatus } from "./enums.js";

// ── Auth ──
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  orgName: z.string().min(1).max(255),
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1).max(255),
});
export type RegisterInput = z.infer<typeof registerSchema>;

// ── Mnemonic SKU ──
export const mnemonicSkuSchema = z
  .string()
  .length(10, "Mnemonic SKU must be exactly 10 characters")
  .regex(/^[A-Z]{10}$/, "Mnemonic SKU must be 10 uppercase letters");
export type MnemonicSku = z.infer<typeof mnemonicSkuSchema>;

// ── Pagination ──
export const paginationSchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type PaginationInput = z.infer<typeof paginationSchema>;

// ── Paginated Response ──
export interface PaginatedResponse<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ── JWT Payload ──
export interface JwtPayload {
  userId: string;
  orgId: string;
  role: string;
  primaryLocationId: string;
}

// ── Store Context ──
export interface StoreContext {
  locationId: string;
  orgId: string;
  locationType: string;
}
```

**Step 5: Create `packages/types/src/index.ts`**

```typescript
export * from "./enums.js";
export * from "./schemas.js";
```

**Step 6: Install deps and build**

Run: `cd packages/types && pnpm install && pnpm build`
Expected: `dist/` folder created with JS + declaration files.

**Step 7: Commit**

```bash
git add packages/types/
git commit -m "feat(types): add shared enums, Zod schemas, and TS interfaces"
```

---

## Task 4: `packages/database` — Drizzle Schema

**Files:**
- Create: `packages/database/package.json`
- Create: `packages/database/tsconfig.json`
- Create: `packages/database/drizzle.config.ts`
- Create: `packages/database/src/index.ts`
- Create: `packages/database/src/schema/organizations.ts`
- Create: `packages/database/src/schema/locations.ts`
- Create: `packages/database/src/schema/users.ts`
- Create: `packages/database/src/schema/products.ts`
- Create: `packages/database/src/schema/inventory.ts`
- Create: `packages/database/src/schema/suppliers.ts`
- Create: `packages/database/src/schema/stock-transfers.ts`
- Create: `packages/database/src/schema/index.ts`

**Step 1: Create `packages/database/package.json`**

```json
{
  "name": "@apex/database",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./schema": {
      "import": "./dist/schema/index.js",
      "types": "./dist/schema/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "generate": "drizzle-kit generate",
    "migrate": "drizzle-kit migrate",
    "studio": "drizzle-kit studio",
    "seed": "tsx src/seed.ts"
  },
  "dependencies": {
    "@apex/types": "workspace:*",
    "drizzle-orm": "^0.45.1",
    "postgres": "^3.4.8",
    "dotenv": "^16.4.7"
  },
  "devDependencies": {
    "@apex/types": "workspace:*",
    "drizzle-kit": "^0.31.9",
    "@faker-js/faker": "^10.3.0",
    "tsx": "^4.21.0",
    "typescript": "^5.9.3"
  }
}
```

**Step 2: Create `packages/database/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

**Step 3: Create `packages/database/drizzle.config.ts`**

```typescript
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
```

**Step 4: Create `packages/database/src/schema/organizations.ts`**

```typescript
import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
```

**Step 5: Create `packages/database/src/schema/locations.ts`**

```typescript
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations.js";

export const locationTypeEnum = pgEnum("location_type", [
  "WAREHOUSE",
  "RETAIL_STORE",
]);

export const locations = pgTable(
  "locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    type: locationTypeEnum("type").notNull(),
    address: varchar("address", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("idx_locations_org_id").on(table.orgId)],
);
```

**Step 6: Create `packages/database/src/schema/users.ts`**

```typescript
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations.js";
import { locations } from "./locations.js";

export const userRoleEnum = pgEnum("user_role", [
  "ADMIN",
  "MANAGER",
  "CASHIER",
  "WAREHOUSE_STAFF",
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  primaryLocationId: uuid("primary_location_id").references(
    () => locations.id,
    { onDelete: "set null" },
  ),
  fullName: varchar("full_name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  role: userRoleEnum("role").notNull().default("CASHIER"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
```

**Step 7: Create `packages/database/src/schema/products.ts`**

This is the most critical table — has trigram index and mnemonic SKU constraint.

```typescript
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  pgEnum,
  index,
  numeric,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./organizations.js";

export const productCategoryEnum = pgEnum("product_category", [
  "TIRES",
  "LUBRICANTS",
  "HARD_PARTS",
  "ACCESSORIES",
  "LABOR_SERVICES",
]);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 500 }).notNull(),
    sku: varchar("sku", { length: 50 }).notNull(),
    mnemonicSku: varchar("mnemonic_sku", { length: 10 }).notNull(),
    category: productCategoryEnum("category").notNull(),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 })
      .notNull()
      .default("0.00"),
    costPrice: numeric("cost_price", { precision: 12, scale: 2 })
      .notNull()
      .default("0.00"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_products_sku").on(table.sku),
    index("idx_products_mnemonic_sku").on(table.mnemonicSku),
    index("idx_products_org_id").on(table.orgId),
    // GIN trigram index for fast partial name search.
    // Requires: CREATE EXTENSION IF NOT EXISTS pg_trgm;
    // This is added via a custom SQL migration (see Task 5, Step 3).
    index("idx_products_name_trgm")
      .on(table.name)
      .using(sql`gin (name gin_trgm_ops)`),
  ],
);
```

**Step 8: Create `packages/database/src/schema/inventory.ts`**

```typescript
import {
  pgTable,
  uuid,
  integer,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { products } from "./products.js";
import { locations } from "./locations.js";

export const inventory = pgTable(
  "inventory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    stockLevel: integer("stock_level").notNull().default(0),
    reorderPoint: integer("reorder_point").notNull().default(10),
    leadTimeDays: integer("lead_time_days").notNull().default(7),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("idx_inventory_product_location").on(
      table.productId,
      table.locationId,
    ),
  ],
);
```

**Step 9: Create `packages/database/src/schema/suppliers.ts`**

```typescript
import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations.js";

export const suppliers = pgTable(
  "suppliers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    contactEmail: varchar("contact_email", { length: 255 }),
    contactPhone: varchar("contact_phone", { length: 50 }),
    address: varchar("address", { length: 500 }),
    avgLeadTimeDays: integer("avg_lead_time_days").notNull().default(7),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("idx_suppliers_org_id").on(table.orgId)],
);
```

**Step 10: Create `packages/database/src/schema/stock-transfers.ts`**

```typescript
import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations.js";
import { locations } from "./locations.js";
import { users } from "./users.js";
import { products } from "./products.js";

export const transferStatusEnum = pgEnum("transfer_status", [
  "DRAFT",
  "PENDING",
  "IN_TRANSIT",
  "RECEIVED",
  "CANCELLED",
]);

export const stockTransfers = pgTable(
  "stock_transfers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sourceLocationId: uuid("source_location_id")
      .notNull()
      .references(() => locations.id),
    destinationLocationId: uuid("destination_location_id")
      .notNull()
      .references(() => locations.id),
    status: transferStatusEnum("status").notNull().default("DRAFT"),
    notes: varchar("notes", { length: 1000 }),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_stock_transfers_org_id").on(table.orgId),
    index("idx_stock_transfers_status").on(table.status),
  ],
);

export const stockTransferItems = pgTable(
  "stock_transfer_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transferId: uuid("transfer_id")
      .notNull()
      .references(() => stockTransfers.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    quantity: integer("quantity").notNull(),
    receivedQuantity: integer("received_quantity"),
  },
  (table) => [index("idx_transfer_items_transfer_id").on(table.transferId)],
);
```

**Step 11: Create `packages/database/src/schema/index.ts`**

```typescript
export * from "./organizations.js";
export * from "./locations.js";
export * from "./users.js";
export * from "./products.js";
export * from "./inventory.js";
export * from "./suppliers.js";
export * from "./stock-transfers.js";
```

**Step 12: Create `packages/database/src/index.ts`**

```typescript
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

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
```

**Step 13: Install deps**

Run: `pnpm install` (from workspace root)
Expected: All workspace dependencies resolved.

**Step 14: Build packages/types then packages/database**

Run: `pnpm --filter @apex/types build && pnpm --filter @apex/database build`
Expected: Both `dist/` folders created successfully.

**Step 15: Commit**

```bash
git add packages/database/ packages/types/
git commit -m "feat(database): add full Drizzle schema with all 8 tables and indexes"
```

---

## Task 5: Generate Migrations + pg_trgm Extension

**Files:**
- Generated: `packages/database/migrations/` (auto by drizzle-kit)
- Create: `packages/database/migrations/0000_enable_pg_trgm.sql` (manual, placed before generated migration)

**Step 1: Ensure Docker Postgres is running**

Run: `docker compose up -d`
Expected: `apex-postgres` is healthy.

**Step 2: Generate the Drizzle migration**

Run: `cd packages/database && pnpm drizzle-kit generate`
Expected: A SQL migration file in `migrations/` with all CREATE TABLE statements.

**Step 3: Create the pg_trgm extension migration**

The GIN trigram index requires the `pg_trgm` extension. We need a migration that runs BEFORE the table creation. Create a file named to sort before the generated migration (e.g., `0000_enable_pg_trgm.sql`):

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

> **Important:** Check the generated migration filename. If it starts with `0000_`, name the extension file `0000_0_enable_pg_trgm.sql` or adjust so it sorts first. Alternatively, if drizzle-kit generates `0001_*`, name the trgm file `0000_enable_pg_trgm.sql`.

**Step 4: Run the migrations**

Run: `cd packages/database && pnpm drizzle-kit migrate`
Expected: All tables created, extension enabled, indexes built. Zero errors.

**Step 5: Verify tables exist**

Run: `docker compose exec postgres psql -U apex -d apex_dev -c "\dt"`
Expected: Lists tables: organizations, locations, users, products, inventory, suppliers, stock_transfers, stock_transfer_items.

**Step 6: Verify trigram index**

Run: `docker compose exec postgres psql -U apex -d apex_dev -c "\di idx_products_name_trgm"`
Expected: Shows the GIN index on `products.name`.

**Step 7: Commit**

```bash
git add packages/database/migrations/
git commit -m "feat(database): generate initial migration with pg_trgm extension"
```

---

## Task 6: `apps/api` — Fastify Server Bootstrap

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/src/app.ts`
- Create: `apps/api/src/server.ts`
- Create: `apps/api/src/modules/health/routes.ts`

**Step 1: Create `apps/api/package.json`**

```json
{
  "name": "@apex/api",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js"
  },
  "dependencies": {
    "@apex/database": "workspace:*",
    "@apex/types": "workspace:*",
    "@fastify/cors": "^11.2.0",
    "@fastify/jwt": "^10.0.0",
    "@fastify/sensible": "^6.0.4",
    "bcryptjs": "^3.0.3",
    "dotenv": "^16.4.7",
    "fastify": "^5.8.1"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "tsx": "^4.21.0",
    "typescript": "^5.9.3"
  }
}
```

**Step 2: Create `apps/api/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "references": [
    { "path": "../../packages/types" },
    { "path": "../../packages/database" }
  ]
}
```

**Step 3: Create `apps/api/src/app.ts`**

```typescript
import "dotenv/config";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import jwt from "@fastify/jwt";
import { healthRoutes } from "./modules/health/routes.js";
import { authRoutes } from "./modules/auth/routes.js";
import { authPlugin } from "./plugins/auth.js";
import { storeContextPlugin } from "./plugins/store-context.js";
import { productRoutes } from "./modules/products/routes.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === "production" ? "info" : "debug",
    },
  });

  // ── Global plugins ──
  await app.register(cors, { origin: true });
  await app.register(sensible);
  await app.register(jwt, {
    secret: process.env.JWT_SECRET || "dev-secret-change-me",
  });

  // ── Custom plugins ──
  await app.register(authPlugin);
  await app.register(storeContextPlugin);

  // ── Routes ──
  await app.register(healthRoutes, { prefix: "/health" });
  await app.register(authRoutes, { prefix: "/auth" });
  await app.register(productRoutes, { prefix: "/products" });

  return app;
}
```

**Step 4: Create `apps/api/src/server.ts`**

```typescript
import { buildApp } from "./app.js";

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";

async function start() {
  const app = await buildApp();
  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`Apex API running on http://${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
```

**Step 5: Create `apps/api/src/modules/health/routes.ts`**

```typescript
import type { FastifyPluginAsync } from "fastify";
import { db } from "@apex/database";
import { sql } from "drizzle-orm";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (_request, reply) => {
    try {
      await db.execute(sql`SELECT 1`);
      return reply.send({
        status: "ok",
        timestamp: new Date().toISOString(),
        database: "connected",
      });
    } catch {
      return reply.status(503).send({
        status: "error",
        timestamp: new Date().toISOString(),
        database: "disconnected",
      });
    }
  });
};
```

**Step 6: Install deps, build, and verify health check**

Run: `pnpm install && pnpm --filter @apex/types build && pnpm --filter @apex/database build`

> Note: Don't build `@apex/api` yet — it references auth and product modules that don't exist yet. We'll create placeholder files first.

**Step 7: Commit (partial — server bootstrap + health)**

```bash
git add apps/api/package.json apps/api/tsconfig.json apps/api/src/app.ts apps/api/src/server.ts apps/api/src/modules/health/routes.ts
git commit -m "feat(api): bootstrap Fastify server with health check endpoint"
```

---

## Task 7: Auth Plugin + Store-Context Middleware

**Files:**
- Create: `apps/api/src/plugins/auth.ts`
- Create: `apps/api/src/plugins/store-context.ts`

**Step 1: Create `apps/api/src/plugins/auth.ts`**

This Fastify plugin adds a `request.authenticate()` decorator that verifies JWT and populates `request.user`.

```typescript
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import type { JwtPayload } from "@apex/types";

// Extend Fastify types
declare module "fastify" {
  interface FastifyRequest {
    user: JwtPayload;
  }
}

const authPluginFn: FastifyPluginAsync = async (app) => {
  app.decorateRequest("user", null);

  app.decorate(
    "authenticate",
    async function (request: FastifyRequest) {
      try {
        const decoded = await request.jwtVerify<JwtPayload>();
        request.user = decoded;
      } catch {
        throw app.httpErrors.unauthorized("Invalid or expired token");
      }
    },
  );
};

export const authPlugin = fp(authPluginFn, {
  name: "auth-plugin",
});
```

> **Note:** Add `fastify-plugin` as a dependency. Update `apps/api/package.json` dependencies to include `"fastify-plugin": "^5.0.1"`.

**Step 2: Create `apps/api/src/plugins/store-context.ts`**

```typescript
import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { db } from "@apex/database";
import { locations } from "@apex/database/schema";
import { eq, and } from "drizzle-orm";
import type { StoreContext } from "@apex/types";

// Paths that skip store-context check
const SKIP_PATHS = ["/health", "/auth/login", "/auth/register"];

declare module "fastify" {
  interface FastifyRequest {
    storeContext: StoreContext;
  }
}

const storeContextPluginFn: FastifyPluginAsync = async (app) => {
  app.decorateRequest("storeContext", null);

  app.addHook("onRequest", async (request, reply) => {
    // Skip for excluded paths
    if (SKIP_PATHS.some((p) => request.url.startsWith(p))) {
      return;
    }

    // Must be authenticated first
    if (!request.user) {
      return;
    }

    const locationId = request.headers["x-location-id"] as string | undefined;
    if (!locationId) {
      return reply
        .status(400)
        .send({ error: "X-Location-ID header is required" });
    }

    // Validate location belongs to user's org
    const [location] = await db
      .select()
      .from(locations)
      .where(
        and(
          eq(locations.id, locationId),
          eq(locations.orgId, request.user.orgId),
        ),
      )
      .limit(1);

    if (!location) {
      return reply
        .status(403)
        .send({ error: "Location not found or access denied" });
    }

    request.storeContext = {
      locationId: location.id,
      orgId: location.orgId,
      locationType: location.type,
    };
  });
};

export const storeContextPlugin = fp(storeContextPluginFn, {
  name: "store-context-plugin",
  dependencies: ["auth-plugin"],
});
```

**Step 3: Add fastify-plugin to api dependencies**

Add to `apps/api/package.json` dependencies: `"fastify-plugin": "^5.0.1"`

Run: `pnpm install`

**Step 4: Commit**

```bash
git add apps/api/src/plugins/
git commit -m "feat(api): add JWT auth plugin and store-context middleware"
```

---

## Task 8: Auth Module (Register + Login)

**Files:**
- Create: `apps/api/src/modules/auth/service.ts`
- Create: `apps/api/src/modules/auth/routes.ts`

**Step 1: Create `apps/api/src/modules/auth/service.ts`**

```typescript
import { db } from "@apex/database";
import { organizations, users, locations } from "@apex/database/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

export async function createOrganizationWithAdmin(input: {
  orgName: string;
  email: string;
  password: string;
  fullName: string;
}) {
  const slug = input.orgName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  // Check for existing email
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);

  if (existingUser) {
    throw new Error("Email already registered");
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

  // Create org
  const [org] = await db
    .insert(organizations)
    .values({ name: input.orgName, slug })
    .returning();

  // Create a default warehouse location
  const [defaultLocation] = await db
    .insert(locations)
    .values({
      orgId: org.id,
      name: `${input.orgName} Main Warehouse`,
      type: "WAREHOUSE",
    })
    .returning();

  // Create admin user
  const [user] = await db
    .insert(users)
    .values({
      orgId: org.id,
      primaryLocationId: defaultLocation.id,
      fullName: input.fullName,
      email: input.email,
      passwordHash,
      role: "ADMIN",
    })
    .returning();

  return { org, user, defaultLocation };
}

export async function authenticateUser(email: string, password: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    throw new Error("Invalid email or password");
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new Error("Invalid email or password");
  }

  return user;
}
```

**Step 2: Create `apps/api/src/modules/auth/routes.ts`**

```typescript
import type { FastifyPluginAsync } from "fastify";
import { registerSchema, loginSchema } from "@apex/types";
import { createOrganizationWithAdmin, authenticateUser } from "./service.js";

export const authRoutes: FastifyPluginAsync = async (app) => {
  // POST /auth/register — Create org + first admin
  app.post("/register", async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.flatten(),
      });
    }

    try {
      const { org, user } = await createOrganizationWithAdmin(parsed.data);
      const token = app.jwt.sign(
        {
          userId: user.id,
          orgId: org.id,
          role: user.role,
          primaryLocationId: user.primaryLocationId,
        },
        { expiresIn: "24h" },
      );

      return reply.status(201).send({
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
        },
        organization: { id: org.id, name: org.name, slug: org.slug },
      });
    } catch (err: any) {
      if (err.message === "Email already registered") {
        return reply.status(409).send({ error: err.message });
      }
      throw err;
    }
  });

  // POST /auth/login — Returns JWT
  app.post("/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.flatten(),
      });
    }

    try {
      const user = await authenticateUser(parsed.data.email, parsed.data.password);
      const token = app.jwt.sign(
        {
          userId: user.id,
          orgId: user.orgId,
          role: user.role,
          primaryLocationId: user.primaryLocationId,
        },
        { expiresIn: "24h" },
      );

      return reply.send({
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
        },
      });
    } catch {
      return reply.status(401).send({ error: "Invalid email or password" });
    }
  });
};
```

**Step 3: Commit**

```bash
git add apps/api/src/modules/auth/
git commit -m "feat(api): add auth module with register and login endpoints"
```

---

## Task 9: Products Module with Keyset Pagination

**Files:**
- Create: `apps/api/src/modules/products/routes.ts`

**Step 1: Create `apps/api/src/modules/products/routes.ts`**

```typescript
import type { FastifyPluginAsync } from "fastify";
import { db } from "@apex/database";
import { products, inventory } from "@apex/database/schema";
import { eq, and, gt, ilike, sql, type SQL } from "drizzle-orm";
import { paginationSchema } from "@apex/types";
import type { PaginatedResponse } from "@apex/types";

export const productRoutes: FastifyPluginAsync = async (app) => {
  // All product routes require auth + store context
  app.addHook("onRequest", async (request) => {
    await (app as any).authenticate(request);
  });

  // GET /products — Keyset-paginated product list for current location
  app.get("/", async (request, reply) => {
    const query = paginationSchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({
        error: "Invalid pagination params",
        details: query.error.flatten(),
      });
    }

    const { cursor, limit } = query.data;
    const { orgId, locationId } = request.storeContext;

    // Optional search query
    const search = (request.query as any).search as string | undefined;

    const conditions: SQL[] = [
      eq(inventory.locationId, locationId),
      eq(products.orgId, orgId),
    ];

    if (cursor) {
      conditions.push(gt(products.id, cursor));
    }

    if (search && search.length >= 2) {
      // Use trigram similarity for partial matching
      conditions.push(ilike(products.name, `%${search}%`));
    }

    const rows = await db
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        mnemonicSku: products.mnemonicSku,
        category: products.category,
        unitPrice: products.unitPrice,
        stockLevel: inventory.stockLevel,
        reorderPoint: inventory.reorderPoint,
      })
      .from(inventory)
      .innerJoin(products, eq(inventory.productId, products.id))
      .where(and(...conditions))
      .orderBy(products.id)
      .limit(limit + 1); // Fetch one extra to detect hasMore

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    const result: PaginatedResponse<(typeof data)[number]> = {
      data,
      nextCursor,
      hasMore,
    };

    return reply.send(result);
  });

  // GET /products/search?q=<term> — Trigram search endpoint
  app.get("/search", async (request, reply) => {
    const { orgId, locationId } = request.storeContext;
    const q = (request.query as any).q as string | undefined;

    if (!q || q.length < 2) {
      return reply
        .status(400)
        .send({ error: "Search query must be at least 2 characters" });
    }

    const rows = await db
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        mnemonicSku: products.mnemonicSku,
        category: products.category,
        unitPrice: products.unitPrice,
        stockLevel: inventory.stockLevel,
      })
      .from(inventory)
      .innerJoin(products, eq(inventory.productId, products.id))
      .where(
        and(
          eq(inventory.locationId, locationId),
          eq(products.orgId, orgId),
          sql`name % ${q}`, // Trigram similarity operator
        ),
      )
      .orderBy(sql`similarity(name, ${q}) DESC`)
      .limit(20);

    return reply.send({ data: rows });
  });
};
```

**Step 2: Commit**

```bash
git add apps/api/src/modules/products/
git commit -m "feat(api): add products module with keyset pagination and trigram search"
```

---

## Task 10: Seed Script (50k Products)

**Files:**
- Create: `packages/database/src/seed.ts`

**Step 1: Create `packages/database/src/seed.ts`**

```typescript
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { faker } from "@faker-js/faker";
import * as schema from "./schema/index.js";
import bcrypt from "bcryptjs";

const TOTAL_PRODUCTS = 50_000;
const BATCH_SIZE = 1_000;

// ── Mnemonic SKU generator ──
// Business uses 10-letter code: K=1, I=2, L=3, O=4, S=5, U=6, T=7, A=8, N=9, G=0
const MNEMONIC_CHARS = "KILOSUTANG";
function generateMnemonicSku(): string {
  let sku = "";
  for (let i = 0; i < 10; i++) {
    sku += MNEMONIC_CHARS[Math.floor(Math.random() * 10)];
  }
  return sku;
}

// ── Realistic automotive product names ──
const TIRE_BRANDS = [
  "Hankook",
  "Nitto",
  "Continental",
  "Bridgestone",
  "Michelin",
  "Goodyear",
  "Yokohama",
  "Toyo",
  "Pirelli",
  "BFGoodrich",
];
const TIRE_TYPES = [
  "All-Season",
  "Performance",
  "Mud-Terrain",
  "Highway",
  "Winter",
  "All-Terrain",
  "Touring",
  "Sport",
];
const TIRE_SIZES = [
  "195/65R15",
  "205/55R16",
  "215/60R16",
  "225/45R17",
  "235/55R18",
  "245/40R18",
  "255/35R19",
  "265/70R17",
  "275/55R20",
  "285/45R22",
  "185/60R15",
  "225/65R17",
  "245/75R16",
  "315/70R17",
];

const OIL_BRANDS = [
  "Mobil 1",
  "Castrol",
  "Valvoline",
  "Pennzoil",
  "Shell Rotella",
  "Royal Purple",
  "Amsoil",
  "Liqui Moly",
];
const OIL_WEIGHTS = [
  "0W-20",
  "5W-30",
  "10W-40",
  "15W-40",
  "5W-20",
  "0W-40",
  "10W-30",
];
const OIL_TYPES = ["Full Synthetic", "Synthetic Blend", "High Mileage", "Conventional", "Diesel"];

const HARD_PARTS = [
  "Brake Pad Set",
  "Brake Rotor",
  "Spark Plug",
  "Oil Filter",
  "Air Filter",
  "Cabin Filter",
  "Alternator",
  "Starter Motor",
  "Water Pump",
  "Thermostat",
  "Fuel Pump",
  "Ignition Coil",
  "CV Axle",
  "Tie Rod End",
  "Ball Joint",
  "Wheel Bearing",
  "Shock Absorber",
  "Strut Assembly",
  "Control Arm",
  "Serpentine Belt",
  "Timing Belt Kit",
  "Clutch Kit",
  "Radiator",
  "AC Compressor",
  "Power Steering Pump",
];
const HARD_PART_BRANDS = [
  "Bosch",
  "Denso",
  "ACDelco",
  "Moog",
  "Monroe",
  "KYB",
  "Dorman",
  "TRW",
  "Gates",
  "Dayco",
];

const ACCESSORIES = [
  "Floor Mat Set",
  "Seat Cover",
  "Phone Mount",
  "Dash Cam",
  "LED Light Bar",
  "Roof Rack",
  "Cargo Net",
  "Mud Flaps",
  "Fender Flares",
  "Bug Deflector",
  "Tonneau Cover",
  "Running Boards",
  "Tow Hitch",
  "Wheel Lock Set",
  "Valve Stem Caps",
];

const LABOR_SERVICES = [
  "Tire Mounting",
  "Wheel Alignment",
  "Oil Change Service",
  "Brake Inspection",
  "Engine Diagnostic",
  "AC Recharge",
  "Transmission Flush",
  "Coolant Flush",
  "Battery Test & Replace",
  "Headlight Restoration",
];

type Category = "TIRES" | "LUBRICANTS" | "HARD_PARTS" | "ACCESSORIES" | "LABOR_SERVICES";

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateProduct(index: number): {
  name: string;
  category: Category;
  unitPrice: string;
  costPrice: string;
} {
  // Distribution: 30% tires, 20% lubes, 30% hard parts, 15% accessories, 5% labor
  const roll = Math.random();

  if (roll < 0.3) {
    const brand = randomFrom(TIRE_BRANDS);
    const type = randomFrom(TIRE_TYPES);
    const size = randomFrom(TIRE_SIZES);
    const unitPrice = (2500 + Math.random() * 12000).toFixed(2);
    return {
      name: `${brand} ${type} ${size}`,
      category: "TIRES",
      unitPrice,
      costPrice: (Number(unitPrice) * 0.65).toFixed(2),
    };
  } else if (roll < 0.5) {
    const brand = randomFrom(OIL_BRANDS);
    const weight = randomFrom(OIL_WEIGHTS);
    const type = randomFrom(OIL_TYPES);
    const liters = randomFrom([1, 4, 5, 6]);
    const unitPrice = (250 + Math.random() * 2500).toFixed(2);
    return {
      name: `${brand} ${type} ${weight} ${liters}L`,
      category: "LUBRICANTS",
      unitPrice,
      costPrice: (Number(unitPrice) * 0.6).toFixed(2),
    };
  } else if (roll < 0.8) {
    const part = randomFrom(HARD_PARTS);
    const brand = randomFrom(HARD_PART_BRANDS);
    const unitPrice = (150 + Math.random() * 8000).toFixed(2);
    return {
      name: `${brand} ${part} - ${faker.vehicle.manufacturer()} ${faker.vehicle.model()}`,
      category: "HARD_PARTS",
      unitPrice,
      costPrice: (Number(unitPrice) * 0.55).toFixed(2),
    };
  } else if (roll < 0.95) {
    const acc = randomFrom(ACCESSORIES);
    const unitPrice = (200 + Math.random() * 5000).toFixed(2);
    return {
      name: `${acc} - Universal Fit #${index}`,
      category: "ACCESSORIES",
      unitPrice,
      costPrice: (Number(unitPrice) * 0.5).toFixed(2),
    };
  } else {
    const svc = randomFrom(LABOR_SERVICES);
    const unitPrice = (300 + Math.random() * 3000).toFixed(2);
    return {
      name: `${svc} (Standard)`,
      category: "LABOR_SERVICES",
      unitPrice,
      costPrice: "0.00",
    };
  }
}

async function seed() {
  console.log("🌱 Starting seed...");
  const start = Date.now();

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client, { schema });

  // ── 1. Create Organization ──
  console.log("  Creating organization...");
  const [org] = await db
    .insert(schema.organizations)
    .values({ name: "Apex Auto Parts Inc.", slug: "apex-auto-parts" })
    .returning();

  // ── 2. Create Locations ──
  console.log("  Creating locations...");
  const [warehouse] = await db
    .insert(schema.locations)
    .values({ orgId: org.id, name: "Central Warehouse", type: "WAREHOUSE", address: "123 Industrial Ave" })
    .returning();

  const [store1] = await db
    .insert(schema.locations)
    .values({ orgId: org.id, name: "Downtown Retail Store", type: "RETAIL_STORE", address: "456 Main St" })
    .returning();

  const [store2] = await db
    .insert(schema.locations)
    .values({ orgId: org.id, name: "Uptown Retail Store", type: "RETAIL_STORE", address: "789 Commerce Blvd" })
    .returning();

  const allLocations = [warehouse, store1, store2];

  // ── 3. Create Admin User ──
  console.log("  Creating admin user...");
  const passwordHash = await bcrypt.hash("admin12345", 12);
  const [adminUser] = await db
    .insert(schema.users)
    .values({
      orgId: org.id,
      primaryLocationId: warehouse.id,
      fullName: "Admin User",
      email: "admin@apex.com",
      passwordHash,
      role: "ADMIN",
    })
    .returning();

  // ── 4. Create Supplier ──
  console.log("  Creating supplier...");
  await db.insert(schema.suppliers).values({
    orgId: org.id,
    name: "PhilParts Distributor",
    contactEmail: "orders@philparts.com",
    contactPhone: "+63-2-8888-1234",
    avgLeadTimeDays: 5,
  });

  // ── 5. Generate 50k Products in batches ──
  console.log(`  Generating ${TOTAL_PRODUCTS.toLocaleString()} products...`);

  const skuSet = new Set<string>(); // Ensure unique SKUs

  for (let batch = 0; batch < TOTAL_PRODUCTS / BATCH_SIZE; batch++) {
    const productBatch: (typeof schema.products.$inferInsert)[] = [];

    for (let i = 0; i < BATCH_SIZE; i++) {
      const idx = batch * BATCH_SIZE + i;
      const { name, category, unitPrice, costPrice } = generateProduct(idx);

      // Unique SKU: category prefix + zero-padded index
      const sku = `${category.slice(0, 3)}-${String(idx).padStart(6, "0")}`;

      productBatch.push({
        orgId: org.id,
        name,
        sku,
        mnemonicSku: generateMnemonicSku(),
        category,
        unitPrice,
        costPrice,
      });
    }

    await db.insert(schema.products).values(productBatch);

    if ((batch + 1) % 10 === 0) {
      console.log(
        `    Inserted ${((batch + 1) * BATCH_SIZE).toLocaleString()} products...`,
      );
    }
  }

  // ── 6. Distribute Inventory across locations ──
  console.log("  Distributing inventory across locations...");

  // Fetch all product IDs
  const allProducts = await db
    .select({ id: schema.products.id })
    .from(schema.products);

  for (let batch = 0; batch < allProducts.length / BATCH_SIZE; batch++) {
    const slice = allProducts.slice(
      batch * BATCH_SIZE,
      (batch + 1) * BATCH_SIZE,
    );

    const inventoryBatch: (typeof schema.inventory.$inferInsert)[] = [];

    for (const product of slice) {
      for (const loc of allLocations) {
        // Warehouse gets more stock; retail stores get less
        const isWarehouse = loc.id === warehouse.id;
        inventoryBatch.push({
          productId: product.id,
          locationId: loc.id,
          stockLevel: isWarehouse
            ? Math.floor(Math.random() * 500) + 50
            : Math.floor(Math.random() * 50) + 5,
          reorderPoint: isWarehouse ? 20 : 5,
          leadTimeDays: isWarehouse ? 14 : 3,
        });
      }
    }

    await db.insert(schema.inventory).values(inventoryBatch);

    if ((batch + 1) % 10 === 0) {
      console.log(
        `    Distributed ${((batch + 1) * BATCH_SIZE).toLocaleString()} products to 3 locations...`,
      );
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n✅ Seed complete in ${elapsed}s`);
  console.log(`   Organization: ${org.name} (${org.id})`);
  console.log(`   Warehouse: ${warehouse.name} (${warehouse.id})`);
  console.log(`   Store 1: ${store1.name} (${store1.id})`);
  console.log(`   Store 2: ${store2.name} (${store2.id})`);
  console.log(`   Admin: admin@apex.com / admin12345`);
  console.log(`   Products: ${TOTAL_PRODUCTS.toLocaleString()}`);
  console.log(`   Inventory rows: ${(TOTAL_PRODUCTS * 3).toLocaleString()}`);

  await client.end();
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
```

**Step 2: Add bcryptjs to database package devDependencies**

In `packages/database/package.json`, add to `devDependencies`: `"bcryptjs": "^3.0.3"` and `"@types/bcryptjs": "^2.4.6"`.

Run: `pnpm install`

**Step 3: Commit**

```bash
git add packages/database/src/seed.ts packages/database/package.json
git commit -m "feat(database): add 50k product seed script with automotive data"
```

---

## Task 11: Full Integration Build + Verify

**Step 1: Install all dependencies**

Run: `pnpm install`

**Step 2: Build all packages in order**

Run: `pnpm --filter @apex/types build && pnpm --filter @apex/database build && pnpm --filter @apex/api build`
Expected: All three packages compile without errors.

**Step 3: Start Postgres if not already running**

Run: `docker compose up -d`

**Step 4: Run migrations**

Run: `pnpm db:migrate`
Expected: All tables created successfully.

**Step 5: Run the seed**

Run: `pnpm db:seed`
Expected output: Seed completes, prints location IDs for warehouse and stores, 50k products, 150k inventory rows.

> **Save the output!** You need the warehouse ID and store IDs for the next step.

**Step 6: Start the dev server**

Run: `pnpm dev`
Expected: Server starts on port 3000.

**Step 7: Test health check**

Run (in new terminal): `curl http://localhost:3000/health`
Expected: `{"status":"ok","timestamp":"...","database":"connected"}`

**Step 8: Test register**

Run:
```bash
curl -s -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"orgName":"Test Corp","email":"test@test.com","password":"test12345","fullName":"Test User"}' | jq .
```
Expected: 201 response with token, user, and organization.

**Step 9: Test login with seeded admin**

Run:
```bash
curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@apex.com","password":"admin12345"}' | jq .
```
Expected: 200 response with JWT token. **Save this token.**

**Step 10: Test products endpoint with pagination (THE 200ms TEST)**

Run (replace `TOKEN` and `LOCATION_ID` with values from seed output):
```bash
time curl -s http://localhost:3000/products?limit=50 \
  -H "Authorization: Bearer TOKEN" \
  -H "X-Location-ID: LOCATION_ID" | jq '.data | length, .hasMore, .nextCursor'
```
Expected:
- Returns `50` items, `hasMore: true`, and a `nextCursor` UUID
- Response time under 200ms

**Step 11: Test cursor-based second page**

Run (replace CURSOR with the `nextCursor` from step 10):
```bash
curl -s "http://localhost:3000/products?limit=50&cursor=CURSOR" \
  -H "Authorization: Bearer TOKEN" \
  -H "X-Location-ID: LOCATION_ID" | jq '.data | length, .hasMore'
```
Expected: Next 50 items returned, still `hasMore: true`.

**Step 12: Commit**

```bash
git add -A
git commit -m "feat: Phase 1 complete — ERP backbone with auth, products, and 50k seed"
```

---

## Task 12: Create CLAUDE.md for Project Memory

**Files:**
- Create: `CLAUDE.md`

**Step 1: Create `CLAUDE.md`**

```markdown
# Apex POS — ERP & POS Suite

## Project Structure
pnpm monorepo: `apps/api` (Fastify), `packages/database` (Drizzle), `packages/types` (shared).

## Commands
- `pnpm dev` — Start API dev server (port 3000)
- `pnpm build` — Build API
- `pnpm db:generate` — Generate Drizzle migrations
- `pnpm db:migrate` — Run migrations
- `pnpm db:seed` — Seed 50k products
- `docker compose up -d` — Start local Postgres

## Architecture
- Multi-tenant: shared DB, filtered by `org_id`
- Store-context: `X-Location-ID` header required on all data routes
- Auth: JWT (`@fastify/jwt`), bcryptjs for hashing
- Pagination: keyset (cursor-based), never OFFSET

## Code Conventions
- Each feature = Fastify plugin in `apps/api/src/modules/<feature>/`
- Schema files: one per table in `packages/database/src/schema/`
- Shared enums/Zod schemas in `packages/types/src/`
- All tables have `created_at` and `updated_at` timestamps
- `mnemonic_sku` is strictly 10 uppercase chars (VARCHAR(10))

## Database
- PostgreSQL 16 (Docker for local, Render for prod)
- Drizzle ORM with `postgres` driver
- `pg_trgm` extension for product name search
- Keyset pagination for all list endpoints
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add CLAUDE.md project memory file"
```

---

## Summary of All Commits

| # | Message |
|---|---------|
| 1 | `chore: scaffold root pnpm workspace with shared tsconfig` |
| 2 | `infra: add Docker Compose for local Postgres and Render blueprint` |
| 3 | `feat(types): add shared enums, Zod schemas, and TS interfaces` |
| 4 | `feat(database): add full Drizzle schema with all 8 tables and indexes` |
| 5 | `feat(database): generate initial migration with pg_trgm extension` |
| 6 | `feat(api): bootstrap Fastify server with health check endpoint` |
| 7 | `feat(api): add JWT auth plugin and store-context middleware` |
| 8 | `feat(api): add auth module with register and login endpoints` |
| 9 | `feat(api): add products module with keyset pagination and trigram search` |
| 10 | `feat(database): add 50k product seed script with automotive data` |
| 11 | `feat: Phase 1 complete — ERP backbone with auth, products, and 50k seed` |
| 12 | `docs: add CLAUDE.md project memory file` |
