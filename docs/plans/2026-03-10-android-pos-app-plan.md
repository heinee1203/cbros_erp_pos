# Android POS App — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a standalone React Native (bare) Android POS app for counter cashiers with barcode scanning, Bluetooth receipt printing, local catalog search, and server-authoritative checkout with reconciliation-first retry.

**Architecture:** Hybrid data layer — WatermelonDB for local product catalog (instant offline search/scan), Zustand + MMKV for cart persistence and session state, React Query for server mutations. Three-tab navigation (POS, Transactions, Settings). Hardware abstraction layer for scanner (HID/camera) and printer (Bluetooth ESC/POS). Checkout is always server-authoritative; failed checkouts are reconciled via idempotency key lookup before retry.

**Tech Stack:** React Native 0.79 (bare), React Navigation 7, WatermelonDB 0.27, Zustand 5, MMKV 3, React Query 5, react-native-ble-plx, react-native-vision-camera

---

## Phase A: Project Scaffolding & Infrastructure

### Task 1: Initialize React Native Project

**Files:**
- Create: `apps/mobile/` (entire RN project)
- Modify: `pnpm-workspace.yaml`
- Modify: `package.json` (root)

**Step 1: Create React Native project**

```bash
cd C:/Users/Admin/Downloads/CLAUDE/APEX_POS
npx @react-native-community/cli init ApexPOS --directory apps/mobile --pm npm
```

**Step 2: Convert to pnpm workspace member**

Add to `pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "tools/*"
```

Already includes `apps/*` — no change needed.

Create `apps/mobile/package.json` name field:
```json
{
  "name": "@apex/mobile"
}
```

**Step 3: Set up directory structure**

```bash
cd apps/mobile
mkdir -p src/{app,components,db,sync,hardware/scanner,hardware/printer,hooks,services,stores,storage,theme}
```

**Step 4: Create TypeScript path aliases**

Create `apps/mobile/tsconfig.json`:
```json
{
  "extends": "@react-native/typescript-config/tsconfig.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@apex/types": ["../../packages/types/src"]
    },
    "strict": true,
    "noEmit": true
  },
  "include": ["src/**/*"]
}
```

**Step 5: Create babel module resolver config**

Update `apps/mobile/babel.config.js`:
```js
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    ['module-resolver', {
      root: ['./src'],
      alias: { '@': './src' },
    }],
    ['@babel/plugin-proposal-decorators', { legacy: true }],
  ],
};
```

**Step 6: Install babel plugins**

```bash
cd apps/mobile
pnpm add -D babel-plugin-module-resolver @babel/plugin-proposal-decorators
```

**Step 7: Verify project builds**

```bash
cd apps/mobile && npx react-native run-android
```

**Step 8: Commit**

```bash
git add apps/mobile pnpm-workspace.yaml
git commit -m "feat(mobile): scaffold React Native project in monorepo"
```

---

### Task 2: Install Core Dependencies

**Files:**
- Modify: `apps/mobile/package.json`

**Step 1: Install navigation**

```bash
cd apps/mobile
pnpm add @react-navigation/native @react-navigation/bottom-tabs @react-navigation/stack react-native-screens react-native-safe-area-context
```

**Step 2: Install data layer**

```bash
pnpm add @nozbe/watermelondb zustand @tanstack/react-query react-native-mmkv
```

**Step 3: Install hardware libraries**

```bash
pnpm add react-native-ble-plx react-native-vision-camera
```

**Step 4: Install utilities**

```bash
pnpm add uuid react-native-svg
pnpm add -D @types/uuid
```

**Step 5: Pod install (iOS not primary but keeps project valid)**

```bash
cd apps/mobile/ios && pod install
```

**Step 6: Verify Android build**

```bash
cd apps/mobile && npx react-native run-android
```

**Step 7: Commit**

```bash
git add apps/mobile/package.json apps/mobile/pnpm-lock.yaml
git commit -m "feat(mobile): install core dependencies"
```

---

### Task 3: Storage Layer (MMKV)

**Files:**
- Create: `apps/mobile/src/storage/mmkv.ts`
- Create: `apps/mobile/src/storage/keys.ts`
- Create: `apps/mobile/src/storage/pending-sales.ts`

**Step 1: Create MMKV instance and typed helpers**

Create `apps/mobile/src/storage/mmkv.ts`:
```typescript
import { MMKV } from 'react-native-mmkv';

export const storage = new MMKV({ id: 'apex-pos' });

export const secureStorage = new MMKV({
  id: 'apex-pos-secure',
  encryptionKey: 'apex-device-key', // TODO: derive from device keystore in production
});

export function getJSON<T>(store: MMKV, key: string): T | null {
  const raw = store.getString(key);
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

export function setJSON(store: MMKV, key: string, value: unknown): void {
  store.set(key, JSON.stringify(value));
}
```

**Step 2: Create storage keys**

Create `apps/mobile/src/storage/keys.ts`:
```typescript
export const KEYS = {
  // Auth
  AUTH_TOKEN: 'auth.token',
  AUTH_USER: 'auth.user',
  AUTH_LOCATION_ID: 'auth.locationId',

  // Device provisioning
  API_BASE_URL: 'device.apiBaseUrl',
  DEVICE_ID: 'device.id',

  // Printer
  PRINTER_DEVICE_ID: 'printer.lastDeviceId',
  PRINTER_PAPER_WIDTH: 'printer.paperWidth',

  // Scanner
  SCANNER_MODE: 'scanner.mode',

  // Sync
  LAST_CATALOG_SYNC: 'sync.lastCatalogSync',
  LAST_INVENTORY_SYNC: 'sync.lastInventorySync',

  // Cart persistence
  CART_STATE: 'cart.state',

  // Pending sales queue
  PENDING_SALES: 'pending.sales',
} as const;
```

**Step 3: Create pending sales queue**

Create `apps/mobile/src/storage/pending-sales.ts`:
```typescript
import { storage, getJSON, setJSON } from './mmkv';
import { KEYS } from './keys';

export interface PendingSale {
  idempotencyKey: string;
  saleId: string;
  payload: {
    idempotencyKey: string;
    payments: Array<{
      method: string;
      amount: string;
      reference?: string;
    }>;
  };
  createdAt: string;
  attempts: number;
  lastAttemptAt: string | null;
  status: 'pending' | 'reconciling' | 'failed';
}

export function getPendingSales(): PendingSale[] {
  return getJSON<PendingSale[]>(storage, KEYS.PENDING_SALES) ?? [];
}

export function addPendingSale(sale: PendingSale): void {
  const current = getPendingSales();
  current.push(sale);
  setJSON(storage, KEYS.PENDING_SALES, current);
}

export function updatePendingSale(
  idempotencyKey: string,
  updates: Partial<PendingSale>,
): void {
  const current = getPendingSales();
  const idx = current.findIndex(s => s.idempotencyKey === idempotencyKey);
  if (idx >= 0) {
    current[idx] = { ...current[idx], ...updates };
    setJSON(storage, KEYS.PENDING_SALES, current);
  }
}

export function removePendingSale(idempotencyKey: string): void {
  const current = getPendingSales().filter(
    s => s.idempotencyKey !== idempotencyKey,
  );
  setJSON(storage, KEYS.PENDING_SALES, current);
}
```

**Step 4: Commit**

```bash
git add apps/mobile/src/storage/
git commit -m "feat(mobile): add MMKV storage layer with pending sales queue"
```

---

### Task 4: API Client for Mobile

**Files:**
- Create: `apps/mobile/src/services/api-client.ts`
- Create: `apps/mobile/src/services/query-client.ts`

**Step 1: Create API client**

Create `apps/mobile/src/services/api-client.ts`:
```typescript
import { secureStorage, storage, getJSON } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function getBaseUrl(): string {
  return storage.getString(KEYS.API_BASE_URL) || 'http://10.0.2.2:3000';
  // 10.0.2.2 = host machine from Android emulator
}

function getToken(): string | null {
  return secureStorage.getString(KEYS.AUTH_TOKEN) ?? null;
}

function getLocationId(): string | null {
  return storage.getString(KEYS.AUTH_LOCATION_ID) ?? null;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { skipAuth?: boolean } = {},
): Promise<T> {
  const { skipAuth, headers: customHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    ...(customHeaders as Record<string, string> || {}),
  };

  if (rest.body) {
    headers['Content-Type'] = 'application/json';
  }

  if (!skipAuth) {
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const locationId = getLocationId();
    if (locationId) headers['X-Location-ID'] = locationId;
  }

  let res: Response;
  try {
    res = await fetch(`${getBaseUrl()}${path}`, { headers, ...rest });
  } catch {
    throw new ApiError('Network error — check connection', 0);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      body.error || `API error: ${res.status}`,
      res.status,
      body,
    );
  }

  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}
```

**Step 2: Create React Query client**

Create `apps/mobile/src/services/query-client.ts`:
```typescript
import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api-client';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
          return false;
        }
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});
```

**Step 3: Commit**

```bash
git add apps/mobile/src/services/
git commit -m "feat(mobile): add API client and React Query setup"
```

---

### Task 5: Auth Service & Context

**Files:**
- Create: `apps/mobile/src/services/auth.ts`
- Create: `apps/mobile/src/hooks/use-auth.ts`

**Step 1: Create auth service**

Create `apps/mobile/src/services/auth.ts`:
```typescript
import { secureStorage, storage, setJSON, getJSON } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';
import { apiFetch, ApiError } from './api-client';

export interface UserInfo {
  id: string;
  email: string;
  fullName: string;
  role: 'ADMIN' | 'MANAGER' | 'CASHIER' | 'WAREHOUSE_STAFF';
}

export interface LoginResponse {
  token: string;
  user: UserInfo;
}

export interface LocationInfo {
  id: string;
  name: string;
  code: string;
  type: string;
  address?: string | null;
  isActive: boolean;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const result = await apiFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
    skipAuth: true,
  });
  // Persist
  secureStorage.set(KEYS.AUTH_TOKEN, result.token);
  setJSON(secureStorage, KEYS.AUTH_USER, result.user);
  return result;
}

export function logout(): void {
  secureStorage.delete(KEYS.AUTH_TOKEN);
  secureStorage.delete(KEYS.AUTH_USER);
  storage.delete(KEYS.AUTH_LOCATION_ID);
}

export function getStoredUser(): UserInfo | null {
  return getJSON<UserInfo>(secureStorage, KEYS.AUTH_USER);
}

export function getStoredToken(): string | null {
  return secureStorage.getString(KEYS.AUTH_TOKEN) ?? null;
}

export function setActiveLocation(locationId: string): void {
  storage.set(KEYS.AUTH_LOCATION_ID, locationId);
}

export function getActiveLocation(): string | null {
  return storage.getString(KEYS.AUTH_LOCATION_ID) ?? null;
}

export async function fetchLocations(): Promise<LocationInfo[]> {
  const result = await apiFetch<{ data: LocationInfo[] }>('/locations');
  return result.data;
}

export function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}
```

**Step 2: Create useAuth hook with React Context**

Create `apps/mobile/src/hooks/use-auth.ts`:
```typescript
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import {
  login as loginService,
  logout as logoutService,
  getStoredUser,
  getStoredToken,
  isTokenExpired,
  setActiveLocation as setLocationService,
  getActiveLocation,
  fetchLocations,
  type UserInfo,
  type LocationInfo,
} from '@/services/auth';

interface AuthContextValue {
  token: string | null;
  user: UserInfo | null;
  locationId: string | null;
  locations: LocationInfo[];
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setLocationId: (id: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [locations, setLocations] = useState<LocationInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Bootstrap from stored credentials
  useEffect(() => {
    const stored = getStoredToken();
    if (stored && !isTokenExpired(stored)) {
      setToken(stored);
      setUser(getStoredUser());
      setLocationId(getActiveLocation());
      fetchLocations().then(setLocations).catch(() => {});
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await loginService(email, password);
    setToken(result.token);
    setUser(result.user);
    const locs = await fetchLocations();
    setLocations(locs);
    // Auto-select first retail location or first available
    const retail = locs.find(l => l.type === 'RETAIL_STORE' || l.type === 'STORE');
    const defaultLoc = retail ?? locs[0];
    if (defaultLoc) {
      setLocationService(defaultLoc.id);
      setLocationId(defaultLoc.id);
    }
  }, []);

  const logout = useCallback(() => {
    logoutService();
    setToken(null);
    setUser(null);
    setLocationId(null);
    setLocations([]);
  }, []);

  const handleSetLocation = useCallback((id: string) => {
    setLocationService(id);
    setLocationId(id);
  }, []);

  const value: AuthContextValue = {
    token,
    user,
    locationId,
    locations,
    isAuthenticated: !!token && !!user && !!locationId,
    isLoading,
    login,
    logout,
    setLocationId: handleSetLocation,
  };

  return React.createElement(AuthContext.Provider, { value }, children);
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

**Step 3: Commit**

```bash
git add apps/mobile/src/services/auth.ts apps/mobile/src/hooks/use-auth.ts
git commit -m "feat(mobile): add auth service with JWT storage and location management"
```

---

### Task 6: WatermelonDB Local Catalog

**Files:**
- Create: `apps/mobile/src/db/schema.ts`
- Create: `apps/mobile/src/db/models/Product.ts`
- Create: `apps/mobile/src/db/models/Inventory.ts`
- Create: `apps/mobile/src/db/models/index.ts`
- Create: `apps/mobile/src/db/database.ts`

**Step 1: Define WatermelonDB schema**

Create `apps/mobile/src/db/schema.ts`:
```typescript
import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const schema = appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'products',
      columns: [
        { name: 'server_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'sku', type: 'string', isIndexed: true },
        { name: 'mnemonic_sku', type: 'string', isIndexed: true },
        { name: 'barcode', type: 'string', isOptional: true, isIndexed: true },
        { name: 'category', type: 'string' },
        { name: 'unit_price', type: 'number' },
        { name: 'image_url', type: 'string', isOptional: true },
        { name: 'family_id', type: 'string', isOptional: true },
        { name: 'server_updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'inventory',
      columns: [
        { name: 'server_id', type: 'string', isIndexed: true },
        { name: 'product_server_id', type: 'string', isIndexed: true },
        { name: 'location_id', type: 'string', isIndexed: true },
        { name: 'stock_level', type: 'number' },
        { name: 'reserved_level', type: 'number' },
        { name: 'reorder_point', type: 'number' },
        { name: 'server_updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'recent_customers',
      columns: [
        { name: 'server_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'phone', type: 'string', isIndexed: true },
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'cached_at', type: 'number' },
      ],
    }),
  ],
});
```

**Step 2: Create Product model**

Create `apps/mobile/src/db/models/Product.ts`:
```typescript
import { Model } from '@nozbe/watermelondb';
import { field, text, readonly, date } from '@nozbe/watermelondb/decorators';

export default class Product extends Model {
  static table = 'products';

  @text('server_id') serverId!: string;
  @text('name') name!: string;
  @text('sku') sku!: string;
  @text('mnemonic_sku') mnemonicSku!: string;
  @text('barcode') barcode!: string | null;
  @text('category') category!: string;
  @field('unit_price') unitPrice!: number;
  @text('image_url') imageUrl!: string | null;
  @text('family_id') familyId!: string | null;
  @field('server_updated_at') serverUpdatedAt!: number;
}
```

**Step 3: Create Inventory model**

Create `apps/mobile/src/db/models/Inventory.ts`:
```typescript
import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

export default class Inventory extends Model {
  static table = 'inventory';

  @text('server_id') serverId!: string;
  @text('product_server_id') productServerId!: string;
  @text('location_id') locationId!: string;
  @field('stock_level') stockLevel!: number;
  @field('reserved_level') reservedLevel!: number;
  @field('reorder_point') reorderPoint!: number;
  @field('server_updated_at') serverUpdatedAt!: number;
}
```

**Step 4: Create RecentCustomer model**

Create `apps/mobile/src/db/models/RecentCustomer.ts`:
```typescript
import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

export default class RecentCustomer extends Model {
  static table = 'recent_customers';

  @text('server_id') serverId!: string;
  @text('name') name!: string;
  @text('phone') phone!: string;
  @text('notes') notes!: string | null;
  @field('cached_at') cachedAt!: number;
}
```

**Step 5: Create model index**

Create `apps/mobile/src/db/models/index.ts`:
```typescript
import Product from './Product';
import Inventory from './Inventory';
import RecentCustomer from './RecentCustomer';

export { Product, Inventory, RecentCustomer };
export const modelClasses = [Product, Inventory, RecentCustomer];
```

**Step 6: Create database instance**

Create `apps/mobile/src/db/database.ts`:
```typescript
import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { schema } from './schema';
import { modelClasses } from './models';

const adapter = new SQLiteAdapter({
  schema,
  jsi: true,        // Use JSI for better performance
  onSetUpError: (error) => {
    console.error('WatermelonDB setup error:', error);
  },
});

export const database = new Database({
  adapter,
  modelClasses,
});
```

**Step 7: Commit**

```bash
git add apps/mobile/src/db/
git commit -m "feat(mobile): add WatermelonDB schema with Product, Inventory, RecentCustomer models"
```

---

### Task 7: API — Catalog Sync Endpoint

**Files:**
- Create: `apps/api/src/modules/sync/routes.ts`
- Create: `apps/api/src/modules/sync/service.ts`
- Modify: `apps/api/src/app.ts` (register plugin)

**Step 1: Create sync service**

Create `apps/api/src/modules/sync/service.ts`:
```typescript
import { db } from "@apex/database";
import { products, inventory } from "@apex/database/schema";
import { and, eq, gt, sql } from "drizzle-orm";

interface SyncOpts {
  orgId: string;
  locationId: string;
  since?: string; // ISO timestamp
}

export async function getCatalogDelta(opts: SyncOpts) {
  const { orgId, locationId, since } = opts;

  const conditions = [eq(products.orgId, orgId)];
  if (since) {
    conditions.push(gt(products.updatedAt, new Date(since)));
  }

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      mnemonicSku: products.mnemonicSku,
      barcode: products.barcode,
      category: products.category,
      unitPrice: products.unitPrice,
      familyId: products.familyId,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .where(and(...conditions))
    .orderBy(products.updatedAt);

  return rows;
}

export async function getInventoryDelta(opts: SyncOpts) {
  const { orgId, locationId, since } = opts;

  const conditions = [
    eq(inventory.orgId, orgId),
    eq(inventory.locationId, locationId),
  ];
  if (since) {
    conditions.push(gt(inventory.updatedAt, new Date(since)));
  }

  const rows = await db
    .select({
      id: inventory.id,
      productId: inventory.productId,
      locationId: inventory.locationId,
      stockLevel: inventory.stockLevel,
      reservedLevel: inventory.reservedLevel,
      reorderPoint: inventory.reorderPoint,
      updatedAt: inventory.updatedAt,
    })
    .from(inventory)
    .where(and(...conditions))
    .orderBy(inventory.updatedAt);

  return rows;
}
```

**Step 2: Create sync routes**

Create `apps/api/src/modules/sync/routes.ts`:
```typescript
import type { FastifyPluginAsync } from "fastify";
import { getCatalogDelta, getInventoryDelta } from "./service";

export const syncRoutes: FastifyPluginAsync = async (app) => {
  // GET /sync/catalog?since=<ISO>&locationId=<uuid>
  app.get("/catalog", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const query = request.query as { since?: string };
    const locationId = request.storeContext!.locationId;

    const data = await getCatalogDelta({
      orgId,
      locationId,
      since: query.since,
    });

    return reply.send({
      data,
      syncedAt: new Date().toISOString(),
      count: data.length,
    });
  });

  // GET /sync/inventory?since=<ISO>
  app.get("/inventory", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const query = request.query as { since?: string };

    const data = await getInventoryDelta({
      orgId,
      locationId,
      since: query.since,
    });

    return reply.send({
      data,
      syncedAt: new Date().toISOString(),
      count: data.length,
    });
  });
};
```

**Step 3: Register sync routes in app.ts**

Add to `apps/api/src/app.ts` alongside other module registrations:
```typescript
import { syncRoutes } from "./modules/sync/routes";
// ... in the build function:
app.register(syncRoutes, { prefix: "/sync" });
```

**Step 4: Verify API build**

```bash
cd apps/api && pnpm build
```

**Step 5: Commit**

```bash
git add apps/api/src/modules/sync/ apps/api/src/app.ts
git commit -m "feat(api): add /sync/catalog and /sync/inventory delta endpoints"
```

---

### Task 8: API — Sale Lookup by Idempotency Key

**Files:**
- Modify: `apps/api/src/modules/sales/routes.ts`
- Modify: `apps/api/src/modules/sales/service.ts`

**Step 1: Add service function**

Add to `apps/api/src/modules/sales/service.ts`:
```typescript
export async function getSaleByIdempotencyKey(
  idempotencyKey: string,
  orgId: string,
) {
  const [sale] = await db
    .select()
    .from(sales)
    .where(
      and(
        eq(sales.idempotencyKey, idempotencyKey),
        eq(sales.orgId, orgId),
      ),
    )
    .limit(1);

  if (!sale) return null;
  return buildSaleDetail(sale);
}
```

**Step 2: Add route**

Add to `apps/api/src/modules/sales/routes.ts` (before the `/:id` catch-all route):
```typescript
// GET /sales/by-idempotency-key/:key — Reconciliation lookup for mobile
app.get("/by-idempotency-key/:key", async (request, reply) => {
  const { key } = request.params as { key: string };
  const { orgId } = request.storeContext!;

  const result = await getSaleByIdempotencyKey(key, orgId);
  if (!result) {
    return reply.status(404).send({ error: "No sale found for this idempotency key" });
  }
  return reply.send(result);
});
```

**Step 3: Update imports in routes.ts**

Add `getSaleByIdempotencyKey` to the import from `"./service"`.

**Step 4: Verify API build**

```bash
cd apps/api && pnpm build
```

**Step 5: Commit**

```bash
git add apps/api/src/modules/sales/
git commit -m "feat(api): add GET /sales/by-idempotency-key/:key for mobile reconciliation"
```

---

### Task 9: Sync Orchestrator (Mobile)

**Files:**
- Create: `apps/mobile/src/sync/catalog-sync.ts`
- Create: `apps/mobile/src/sync/inventory-sync.ts`
- Create: `apps/mobile/src/sync/sync-manager.ts`

**Step 1: Create catalog sync**

Create `apps/mobile/src/sync/catalog-sync.ts`:
```typescript
import { database } from '@/db/database';
import { Product } from '@/db/models';
import { apiFetch } from '@/services/api-client';
import { storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';
import { Q } from '@nozbe/watermelondb';

interface ServerProduct {
  id: string;
  name: string;
  sku: string;
  mnemonicSku: string;
  barcode: string | null;
  category: string;
  unitPrice: string;
  familyId: string | null;
  updatedAt: string;
}

interface CatalogSyncResponse {
  data: ServerProduct[];
  syncedAt: string;
  count: number;
}

export async function syncCatalog(): Promise<{ upserted: number }> {
  const since = storage.getString(KEYS.LAST_CATALOG_SYNC);
  const qs = since ? `?since=${encodeURIComponent(since)}` : '';

  const response = await apiFetch<CatalogSyncResponse>(`/sync/catalog${qs}`);

  if (response.data.length === 0) {
    storage.set(KEYS.LAST_CATALOG_SYNC, response.syncedAt);
    return { upserted: 0 };
  }

  const collection = database.get<Product>('products');

  await database.write(async () => {
    const batchOps: any[] = [];

    for (const item of response.data) {
      // Check if product already exists locally
      const existing = await collection
        .query(Q.where('server_id', item.id))
        .fetch();

      if (existing.length > 0) {
        // Update
        batchOps.push(
          existing[0].prepareUpdate((record: any) => {
            record.name = item.name;
            record.sku = item.sku;
            record.mnemonicSku = item.mnemonicSku;
            record.barcode = item.barcode;
            record.category = item.category;
            record.unitPrice = parseFloat(item.unitPrice);
            record.familyId = item.familyId;
            record.serverUpdatedAt = new Date(item.updatedAt).getTime();
          }),
        );
      } else {
        // Insert
        batchOps.push(
          collection.prepareCreate((record: any) => {
            record.serverId = item.id;
            record.name = item.name;
            record.sku = item.sku;
            record.mnemonicSku = item.mnemonicSku;
            record.barcode = item.barcode;
            record.category = item.category;
            record.unitPrice = parseFloat(item.unitPrice);
            record.familyId = item.familyId;
            record.serverUpdatedAt = new Date(item.updatedAt).getTime();
          }),
        );
      }
    }

    await database.batch(...batchOps);
  });

  storage.set(KEYS.LAST_CATALOG_SYNC, response.syncedAt);
  return { upserted: response.data.length };
}
```

**Step 2: Create inventory sync**

Create `apps/mobile/src/sync/inventory-sync.ts`:
```typescript
import { database } from '@/db/database';
import { Inventory } from '@/db/models';
import { apiFetch } from '@/services/api-client';
import { storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';
import { Q } from '@nozbe/watermelondb';

interface ServerInventory {
  id: string;
  productId: string;
  locationId: string;
  stockLevel: number;
  reservedLevel: number;
  reorderPoint: number;
  updatedAt: string;
}

interface InventorySyncResponse {
  data: ServerInventory[];
  syncedAt: string;
  count: number;
}

export async function syncInventory(): Promise<{ upserted: number }> {
  const since = storage.getString(KEYS.LAST_INVENTORY_SYNC);
  const qs = since ? `?since=${encodeURIComponent(since)}` : '';

  const response = await apiFetch<InventorySyncResponse>(`/sync/inventory${qs}`);

  if (response.data.length === 0) {
    storage.set(KEYS.LAST_INVENTORY_SYNC, response.syncedAt);
    return { upserted: 0 };
  }

  const collection = database.get<Inventory>('inventory');

  await database.write(async () => {
    const batchOps: any[] = [];

    for (const item of response.data) {
      const existing = await collection
        .query(Q.where('server_id', item.id))
        .fetch();

      if (existing.length > 0) {
        batchOps.push(
          existing[0].prepareUpdate((record: any) => {
            record.productServerId = item.productId;
            record.locationId = item.locationId;
            record.stockLevel = item.stockLevel;
            record.reservedLevel = item.reservedLevel;
            record.reorderPoint = item.reorderPoint;
            record.serverUpdatedAt = new Date(item.updatedAt).getTime();
          }),
        );
      } else {
        batchOps.push(
          collection.prepareCreate((record: any) => {
            record.serverId = item.id;
            record.productServerId = item.productId;
            record.locationId = item.locationId;
            record.stockLevel = item.stockLevel;
            record.reservedLevel = item.reservedLevel;
            record.reorderPoint = item.reorderPoint;
            record.serverUpdatedAt = new Date(item.updatedAt).getTime();
          }),
        );
      }
    }

    await database.batch(...batchOps);
  });

  storage.set(KEYS.LAST_INVENTORY_SYNC, response.syncedAt);
  return { upserted: response.data.length };
}
```

**Step 3: Create sync manager**

Create `apps/mobile/src/sync/sync-manager.ts`:
```typescript
import { syncCatalog } from './catalog-sync';
import { syncInventory } from './inventory-sync';
import { storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';

export interface SyncStatus {
  isSyncing: boolean;
  lastCatalogSync: string | null;
  lastInventorySync: string | null;
  error: string | null;
}

let _isSyncing = false;
let _listeners: Array<(status: SyncStatus) => void> = [];

function getStatus(): SyncStatus {
  return {
    isSyncing: _isSyncing,
    lastCatalogSync: storage.getString(KEYS.LAST_CATALOG_SYNC) ?? null,
    lastInventorySync: storage.getString(KEYS.LAST_INVENTORY_SYNC) ?? null,
    error: null,
  };
}

function notify(status: SyncStatus) {
  _listeners.forEach(fn => fn(status));
}

export function onSyncStatus(listener: (status: SyncStatus) => void): () => void {
  _listeners.push(listener);
  return () => {
    _listeners = _listeners.filter(fn => fn !== listener);
  };
}

export async function runFullSync(): Promise<SyncStatus> {
  if (_isSyncing) return getStatus();

  _isSyncing = true;
  notify(getStatus());

  try {
    await syncCatalog();
    await syncInventory();

    const status = getStatus();
    _isSyncing = false;
    notify(status);
    return status;
  } catch (error: any) {
    _isSyncing = false;
    const status = { ...getStatus(), error: error.message };
    notify(status);
    return status;
  }
}

export { getStatus as getSyncStatus };
```

**Step 4: Commit**

```bash
git add apps/mobile/src/sync/
git commit -m "feat(mobile): add delta sync orchestrator for catalog and inventory"
```

---

## Phase B: Hardware Abstraction

### Task 10: Scanner Abstraction

**Files:**
- Create: `apps/mobile/src/hardware/scanner/types.ts`
- Create: `apps/mobile/src/hardware/scanner/hid-adapter.ts`
- Create: `apps/mobile/src/hardware/scanner/camera-adapter.ts`
- Create: `apps/mobile/src/hardware/scanner/mock-adapter.ts`
- Create: `apps/mobile/src/hardware/scanner/context.tsx`

**Step 1: Create scanner types**

Create `apps/mobile/src/hardware/scanner/types.ts`:
```typescript
export interface ScanResult {
  barcode: string;
  format: 'EAN13' | 'EAN8' | 'UPC_A' | 'CODE128' | 'QR' | string;
  timestamp: number;
}

export interface ScannerProvider {
  readonly type: 'hid' | 'camera' | 'mock';
  readonly isAvailable: boolean;

  /** HID: start listening for keyboard-wedge input */
  startListening(): void;
  /** HID: stop listening */
  stopListening(): void;
  /** Camera: open scanner modal, returns result or null if cancelled */
  openCameraScanner(): Promise<ScanResult | null>;
  /** Subscribe to scan events. Returns unsubscribe function. */
  onScan(callback: (result: ScanResult) => void): () => void;
}
```

**Step 2: Create HID scanner adapter**

Create `apps/mobile/src/hardware/scanner/hid-adapter.ts`:
```typescript
import { DeviceEventEmitter, NativeEventEmitter, Platform } from 'react-native';
import type { ScanResult, ScannerProvider } from './types';

/**
 * HID Scanner Adapter
 *
 * Listens for rapid keystroke sequences from USB/Bluetooth HID barcode scanners.
 * These scanners act as keyboard input — they type the barcode followed by Enter.
 *
 * Focus/capture rules:
 * - Only captures when explicitly listening (startListening called)
 * - Detects scanner vs manual typing by inter-keystroke speed (<50ms = scanner)
 * - Barcode must end with Enter key within 300ms of first character
 * - Minimum barcode length: 4 characters
 * - While listening, scanner input is captured and NOT passed to focused text fields
 */
export class HIDScannerAdapter implements ScannerProvider {
  readonly type = 'hid' as const;
  readonly isAvailable = true;

  private _listening = false;
  private _buffer = '';
  private _lastKeyTime = 0;
  private _timeout: ReturnType<typeof setTimeout> | null = null;
  private _callbacks: Array<(result: ScanResult) => void> = [];
  private _keySubscription: any = null;

  private static readonly INTER_KEY_THRESHOLD = 50;  // ms — scanner types faster than this
  private static readonly BUFFER_TIMEOUT = 300;       // ms — max time for complete barcode
  private static readonly MIN_LENGTH = 4;

  startListening(): void {
    if (this._listening) return;
    this._listening = true;
    // NOTE: Actual key interception requires a native module or
    // a transparent overlay that captures KeyEvent before TextInput.
    // This is a placeholder that will be connected to the native key listener.
    console.log('[HIDScanner] Listening started');
  }

  stopListening(): void {
    this._listening = false;
    this._clearBuffer();
    console.log('[HIDScanner] Listening stopped');
  }

  async openCameraScanner(): Promise<ScanResult | null> {
    // HID adapter doesn't support camera
    return null;
  }

  onScan(callback: (result: ScanResult) => void): () => void {
    this._callbacks.push(callback);
    return () => {
      this._callbacks = this._callbacks.filter(cb => cb !== callback);
    };
  }

  /** Called by native key event handler */
  handleKeyEvent(key: string, timestamp: number): void {
    if (!this._listening) return;

    const elapsed = timestamp - this._lastKeyTime;
    this._lastKeyTime = timestamp;

    // If too slow, this is manual typing — reset buffer
    if (this._buffer.length > 0 && elapsed > HIDScannerAdapter.INTER_KEY_THRESHOLD) {
      this._clearBuffer();
    }

    if (key === 'Enter' || key === '\n') {
      if (this._buffer.length >= HIDScannerAdapter.MIN_LENGTH) {
        this._emitScan(this._buffer);
      }
      this._clearBuffer();
      return;
    }

    this._buffer += key;

    // Safety timeout
    if (this._timeout) clearTimeout(this._timeout);
    this._timeout = setTimeout(() => this._clearBuffer(), HIDScannerAdapter.BUFFER_TIMEOUT);
  }

  private _emitScan(barcode: string): void {
    const result: ScanResult = {
      barcode,
      format: this._detectFormat(barcode),
      timestamp: Date.now(),
    };
    this._callbacks.forEach(cb => cb(result));
  }

  private _detectFormat(barcode: string): string {
    if (/^\d{13}$/.test(barcode)) return 'EAN13';
    if (/^\d{8}$/.test(barcode)) return 'EAN8';
    if (/^\d{12}$/.test(barcode)) return 'UPC_A';
    return 'CODE128';
  }

  private _clearBuffer(): void {
    this._buffer = '';
    if (this._timeout) {
      clearTimeout(this._timeout);
      this._timeout = null;
    }
  }
}
```

**Step 3: Create camera scanner adapter**

Create `apps/mobile/src/hardware/scanner/camera-adapter.ts`:
```typescript
import type { ScanResult, ScannerProvider } from './types';

/**
 * Camera Scanner Adapter
 *
 * Uses react-native-vision-camera for barcode scanning via device camera.
 * Opens a modal scanner view; auto-detects barcode and returns result.
 *
 * Note: The actual camera UI is a React component (BarcodeScannerModal).
 * This adapter coordinates between the component and consumers.
 */
export class CameraScannerAdapter implements ScannerProvider {
  readonly type = 'camera' as const;
  readonly isAvailable = true;

  private _callbacks: Array<(result: ScanResult) => void> = [];
  private _resolvePromise: ((result: ScanResult | null) => void) | null = null;

  startListening(): void {
    // Camera scanner doesn't passively listen — it requires explicit open
  }

  stopListening(): void {
    // No-op for camera
  }

  async openCameraScanner(): Promise<ScanResult | null> {
    return new Promise<ScanResult | null>(resolve => {
      this._resolvePromise = resolve;
      // The ScannerContext will detect this and show the camera modal
      this._callbacks.forEach(cb =>
        cb({ barcode: '__OPEN_CAMERA__', format: 'COMMAND', timestamp: Date.now() }),
      );
    });
  }

  /** Called by BarcodeScannerModal when a barcode is detected */
  handleCameraResult(barcode: string, format: string): void {
    const result: ScanResult = { barcode, format, timestamp: Date.now() };
    if (this._resolvePromise) {
      this._resolvePromise(result);
      this._resolvePromise = null;
    }
    // Also notify listeners
    this._callbacks.forEach(cb => cb(result));
  }

  /** Called when camera modal is dismissed without scanning */
  handleCameraCancel(): void {
    if (this._resolvePromise) {
      this._resolvePromise(null);
      this._resolvePromise = null;
    }
  }

  onScan(callback: (result: ScanResult) => void): () => void {
    this._callbacks.push(callback);
    return () => {
      this._callbacks = this._callbacks.filter(cb => cb !== callback);
    };
  }
}
```

**Step 4: Create mock scanner adapter**

Create `apps/mobile/src/hardware/scanner/mock-adapter.ts`:
```typescript
import type { ScanResult, ScannerProvider } from './types';

export class MockScannerAdapter implements ScannerProvider {
  readonly type = 'mock' as const;
  readonly isAvailable = true;

  private _callbacks: Array<(result: ScanResult) => void> = [];

  startListening(): void {}
  stopListening(): void {}

  async openCameraScanner(): Promise<ScanResult | null> {
    // Simulate a scan after 1 second
    return new Promise(resolve => {
      setTimeout(() => {
        resolve({
          barcode: '4806512345678',
          format: 'EAN13',
          timestamp: Date.now(),
        });
      }, 1000);
    });
  }

  /** Manually trigger a mock scan (for dev/testing) */
  simulateScan(barcode: string): void {
    const result: ScanResult = {
      barcode,
      format: /^\d{13}$/.test(barcode) ? 'EAN13' : 'CODE128',
      timestamp: Date.now(),
    };
    this._callbacks.forEach(cb => cb(result));
  }

  onScan(callback: (result: ScanResult) => void): () => void {
    this._callbacks.push(callback);
    return () => {
      this._callbacks = this._callbacks.filter(cb => cb !== callback);
    };
  }
}
```

**Step 5: Create scanner context**

Create `apps/mobile/src/hardware/scanner/context.tsx`:
```typescript
import React, { createContext, useContext, useRef, useMemo } from 'react';
import type { ScannerProvider } from './types';
import { HIDScannerAdapter } from './hid-adapter';
import { CameraScannerAdapter } from './camera-adapter';
import { MockScannerAdapter } from './mock-adapter';
import { storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';

const ScannerContext = createContext<ScannerProvider | null>(null);

function createScanner(): ScannerProvider {
  const mode = storage.getString(KEYS.SCANNER_MODE);

  if (__DEV__ && mode === 'mock') return new MockScannerAdapter();
  if (mode === 'camera') return new CameraScannerAdapter();

  // Default: HID for counter POS
  return new HIDScannerAdapter();
}

export function ScannerProviderComponent({ children }: { children: React.ReactNode }) {
  const scannerRef = useRef<ScannerProvider>(createScanner());

  return React.createElement(
    ScannerContext.Provider,
    { value: scannerRef.current },
    children,
  );
}

export function useScanner(): ScannerProvider {
  const ctx = useContext(ScannerContext);
  if (!ctx) throw new Error('useScanner must be used within ScannerProvider');
  return ctx;
}
```

**Step 6: Commit**

```bash
git add apps/mobile/src/hardware/scanner/
git commit -m "feat(mobile): add scanner abstraction with HID, camera, and mock adapters"
```

---

### Task 11: Printer Abstraction & ESC/POS Builder

**Files:**
- Create: `apps/mobile/src/hardware/printer/types.ts`
- Create: `apps/mobile/src/hardware/printer/escpos-builder.ts`
- Create: `apps/mobile/src/hardware/printer/bluetooth-adapter.ts`
- Create: `apps/mobile/src/hardware/printer/mock-adapter.ts`
- Create: `apps/mobile/src/hardware/printer/context.tsx`

**Step 1: Create printer types**

Create `apps/mobile/src/hardware/printer/types.ts`:
```typescript
export interface PrinterDevice {
  id: string;
  name: string;
  address: string;
  rssi?: number;
}

export interface ReceiptData {
  header: {
    storeName: string;
    address?: string;
    phone?: string;
  };
  transaction: {
    receiptNumber: string;
    date: string;
    cashier: string;
    lines: Array<{
      name: string;
      qty: number;
      unitPrice: number;
      total: number;
    }>;
    subtotal: number;
    discount: number;
    grandTotal: number;
    paymentMethod: string;
    cashTendered?: number;
    change?: number;
  };
  footer: {
    message: string;
  };
}

export interface PrintResult {
  success: boolean;
  error?: string;
}

export interface PrinterProvider {
  readonly type: 'bluetooth' | 'mock';
  readonly isConnected: boolean;

  discover(): Promise<PrinterDevice[]>;
  connect(deviceId: string): Promise<void>;
  disconnect(): Promise<void>;
  printReceipt(receipt: ReceiptData): Promise<PrintResult>;
  printTestPage(): Promise<PrintResult>;
  openCashDrawer(): Promise<void>;
}
```

**Step 2: Create ESC/POS builder**

Create `apps/mobile/src/hardware/printer/escpos-builder.ts`:
```typescript
/**
 * ESC/POS command builder for thermal receipt printers.
 * Supports 58mm (32 chars/line) and 80mm (48 chars/line).
 */
export class ESCPOSBuilder {
  private buffer: number[] = [];
  private lineWidth: number;

  constructor(paperWidth: '58mm' | '80mm' = '80mm') {
    this.lineWidth = paperWidth === '58mm' ? 32 : 48;
  }

  /** ESC @ — Initialize printer */
  initialize(): this {
    this.buffer.push(0x1b, 0x40);
    return this;
  }

  /** ESC a 1 — Center align */
  alignCenter(): this {
    this.buffer.push(0x1b, 0x61, 0x01);
    return this;
  }

  /** ESC a 0 — Left align */
  alignLeft(): this {
    this.buffer.push(0x1b, 0x61, 0x00);
    return this;
  }

  /** ESC E n — Bold on/off */
  bold(on: boolean): this {
    this.buffer.push(0x1b, 0x45, on ? 0x01 : 0x00);
    return this;
  }

  /** GS ! n — Font size (1 = normal, 2 = double height+width) */
  fontSize(size: 1 | 2): this {
    const n = size === 2 ? 0x11 : 0x00;
    this.buffer.push(0x1d, 0x21, n);
    return this;
  }

  /** Print a line of text */
  text(line: string): this {
    const bytes = this.encodeText(line + '\n');
    this.buffer.push(...bytes);
    return this;
  }

  /** Print two columns: left-aligned and right-aligned */
  columns(left: string, right: string): this {
    const gap = this.lineWidth - left.length - right.length;
    const padding = gap > 0 ? ' '.repeat(gap) : ' ';
    return this.text(left + padding + right);
  }

  /** Print three columns */
  threeColumns(left: string, center: string, right: string): this {
    const totalContent = left.length + center.length + right.length;
    const totalGap = this.lineWidth - totalContent;
    const leftGap = Math.floor(totalGap / 2);
    const rightGap = totalGap - leftGap;
    const padL = leftGap > 0 ? ' '.repeat(leftGap) : ' ';
    const padR = rightGap > 0 ? ' '.repeat(rightGap) : ' ';
    return this.text(left + padL + center + padR + right);
  }

  /** Print separator line */
  separator(char: string = '-'): this {
    return this.text(char.repeat(this.lineWidth));
  }

  /** LF — Empty line */
  newline(count: number = 1): this {
    for (let i = 0; i < count; i++) {
      this.buffer.push(0x0a);
    }
    return this;
  }

  /** GS V 66 — Partial cut */
  cut(): this {
    this.newline(3);
    this.buffer.push(0x1d, 0x56, 0x42, 0x00);
    return this;
  }

  /** ESC p 0 — Open cash drawer */
  openDrawer(): this {
    this.buffer.push(0x1b, 0x70, 0x00, 0x19, 0xfa);
    return this;
  }

  /** Build final byte array */
  build(): Uint8Array {
    return new Uint8Array(this.buffer);
  }

  private encodeText(text: string): number[] {
    const bytes: number[] = [];
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      bytes.push(code > 127 ? 0x3f : code); // Replace non-ASCII with ?
    }
    return bytes;
  }
}

/** Format a number as PHP currency for receipt printing */
export function fmtPHP(amount: number): string {
  return amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
```

**Step 3: Create Bluetooth printer adapter**

Create `apps/mobile/src/hardware/printer/bluetooth-adapter.ts`:
```typescript
import { BleManager, type Device } from 'react-native-ble-plx';
import { ESCPOSBuilder, fmtPHP } from './escpos-builder';
import type { PrinterProvider, PrinterDevice, ReceiptData, PrintResult } from './types';
import { storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';

const PRINTER_SERVICE_UUID = '000018f0-0000-1000-8000-00805f9b34fb';
const PRINTER_CHAR_UUID = '00002af1-0000-1000-8000-00805f9b34fb';

export class BluetoothPrinterAdapter implements PrinterProvider {
  readonly type = 'bluetooth' as const;

  private manager: BleManager;
  private device: Device | null = null;

  get isConnected(): boolean {
    return this.device !== null;
  }

  constructor() {
    this.manager = new BleManager();
  }

  async discover(): Promise<PrinterDevice[]> {
    const devices: PrinterDevice[] = [];

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.manager.stopDeviceScan();
        resolve(devices);
      }, 10000);

      this.manager.startDeviceScan(null, null, (error, device) => {
        if (error || !device?.name) return;
        if (!devices.find(d => d.id === device.id)) {
          devices.push({
            id: device.id,
            name: device.name || 'Unknown',
            address: device.id,
            rssi: device.rssi ?? undefined,
          });
        }
      });
    });
  }

  async connect(deviceId: string): Promise<void> {
    const device = await this.manager.connectToDevice(deviceId);
    await device.discoverAllServicesAndCharacteristics();
    this.device = device;
    storage.set(KEYS.PRINTER_DEVICE_ID, deviceId);
  }

  async disconnect(): Promise<void> {
    if (this.device) {
      await this.manager.cancelDeviceConnection(this.device.id);
      this.device = null;
    }
  }

  async printReceipt(receipt: ReceiptData): Promise<PrintResult> {
    if (!this.device) return { success: false, error: 'Printer not connected' };

    const paperWidth = (storage.getString(KEYS.PRINTER_PAPER_WIDTH) || '80mm') as '58mm' | '80mm';
    const builder = new ESCPOSBuilder(paperWidth);

    builder
      .initialize()
      .alignCenter()
      .bold(true)
      .fontSize(2)
      .text(receipt.header.storeName)
      .fontSize(1)
      .bold(false);

    if (receipt.header.address) builder.text(receipt.header.address);
    if (receipt.header.phone) builder.text(receipt.header.phone);

    builder
      .separator()
      .alignLeft()
      .columns('Receipt:', receipt.transaction.receiptNumber)
      .columns('Date:', receipt.transaction.date)
      .columns('Cashier:', receipt.transaction.cashier)
      .separator();

    // Line items
    for (const line of receipt.transaction.lines) {
      const nameStr = line.name.substring(0, paperWidth === '58mm' ? 20 : 32);
      builder.text(nameStr);
      builder.columns(
        `  ${line.qty} x ${fmtPHP(line.unitPrice)}`,
        fmtPHP(line.total),
      );
    }

    builder
      .separator()
      .columns('Subtotal', fmtPHP(receipt.transaction.subtotal));

    if (receipt.transaction.discount > 0) {
      builder.columns('Discount', `-${fmtPHP(receipt.transaction.discount)}`);
    }

    builder
      .bold(true)
      .fontSize(2)
      .columns('TOTAL', fmtPHP(receipt.transaction.grandTotal))
      .fontSize(1)
      .bold(false)
      .separator()
      .columns('Payment', receipt.transaction.paymentMethod);

    if (receipt.transaction.cashTendered !== undefined) {
      builder.columns('Cash', fmtPHP(receipt.transaction.cashTendered));
      builder.columns('Change', fmtPHP(receipt.transaction.change ?? 0));
    }

    builder
      .newline()
      .alignCenter()
      .text(receipt.footer.message)
      .newline(2)
      .cut();

    try {
      const data = builder.build();
      // Write in chunks (BLE has MTU limits)
      const CHUNK_SIZE = 512;
      for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        const chunk = data.slice(i, i + CHUNK_SIZE);
        const base64 = this.uint8ToBase64(chunk);
        await this.device.writeCharacteristicWithResponseForService(
          PRINTER_SERVICE_UUID,
          PRINTER_CHAR_UUID,
          base64,
        );
      }
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async printTestPage(): Promise<PrintResult> {
    return this.printReceipt({
      header: { storeName: 'APEX AUTO PARTS', address: 'Test Print' },
      transaction: {
        receiptNumber: 'TEST-001',
        date: new Date().toLocaleString(),
        cashier: 'System',
        lines: [{ name: 'Test Item', qty: 1, unitPrice: 100, total: 100 }],
        subtotal: 100,
        discount: 0,
        grandTotal: 100,
        paymentMethod: 'CASH',
      },
      footer: { message: 'Printer test successful' },
    });
  }

  async openCashDrawer(): Promise<void> {
    if (!this.device) return;
    const builder = new ESCPOSBuilder();
    builder.openDrawer();
    const data = builder.build();
    const base64 = this.uint8ToBase64(data);
    await this.device.writeCharacteristicWithResponseForService(
      PRINTER_SERVICE_UUID,
      PRINTER_CHAR_UUID,
      base64,
    );
  }

  private uint8ToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}
```

**Step 4: Create mock printer adapter**

Create `apps/mobile/src/hardware/printer/mock-adapter.ts`:
```typescript
import type { PrinterProvider, PrinterDevice, ReceiptData, PrintResult } from './types';

export class MockPrinterAdapter implements PrinterProvider {
  readonly type = 'mock' as const;
  private _connected = false;

  get isConnected(): boolean {
    return this._connected;
  }

  async discover(): Promise<PrinterDevice[]> {
    return [
      { id: 'mock-printer-1', name: 'Mock Printer (Dev)', address: 'AA:BB:CC:DD:EE:FF' },
    ];
  }

  async connect(_deviceId: string): Promise<void> {
    this._connected = true;
    console.log('[MockPrinter] Connected');
  }

  async disconnect(): Promise<void> {
    this._connected = false;
    console.log('[MockPrinter] Disconnected');
  }

  async printReceipt(receipt: ReceiptData): Promise<PrintResult> {
    console.log('[MockPrinter] Receipt:', JSON.stringify(receipt, null, 2));
    return { success: true };
  }

  async printTestPage(): Promise<PrintResult> {
    console.log('[MockPrinter] Test page printed');
    return { success: true };
  }

  async openCashDrawer(): Promise<void> {
    console.log('[MockPrinter] Cash drawer opened');
  }
}
```

**Step 5: Create printer context**

Create `apps/mobile/src/hardware/printer/context.tsx`:
```typescript
import React, { createContext, useContext, useRef, useEffect } from 'react';
import type { PrinterProvider } from './types';
import { BluetoothPrinterAdapter } from './bluetooth-adapter';
import { MockPrinterAdapter } from './mock-adapter';
import { storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';

const PrinterContext = createContext<PrinterProvider | null>(null);

function createPrinter(): PrinterProvider {
  if (__DEV__) return new MockPrinterAdapter();
  return new BluetoothPrinterAdapter();
}

export function PrinterProviderComponent({ children }: { children: React.ReactNode }) {
  const printerRef = useRef<PrinterProvider>(createPrinter());

  // Auto-reconnect to last known printer
  useEffect(() => {
    const lastDeviceId = storage.getString(KEYS.PRINTER_DEVICE_ID);
    if (lastDeviceId && !printerRef.current.isConnected) {
      printerRef.current.connect(lastDeviceId).catch(() => {
        // Silent fail on auto-reconnect — user can manually reconnect in settings
      });
    }
  }, []);

  return React.createElement(
    PrinterContext.Provider,
    { value: printerRef.current },
    children,
  );
}

export function usePrinter(): PrinterProvider {
  const ctx = useContext(PrinterContext);
  if (!ctx) throw new Error('usePrinter must be used within PrinterProvider');
  return ctx;
}
```

**Step 6: Commit**

```bash
git add apps/mobile/src/hardware/printer/
git commit -m "feat(mobile): add printer abstraction with BT ESC/POS and mock adapters"
```

---

## Phase C: Cart & Checkout

### Task 12: Cart Store (Zustand + MMKV Persistence)

**Files:**
- Create: `apps/mobile/src/stores/cart-store.ts`

**Step 1: Create cart store**

Create `apps/mobile/src/stores/cart-store.ts`:
```typescript
import { create } from 'zustand';
import { storage, getJSON, setJSON } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';
import { v4 as uuid } from 'uuid';

export interface CartLine {
  id: string;
  productId: string;    // server UUID
  name: string;
  sku: string;
  mnemonicSku: string;
  barcode: string | null;
  unitPrice: number;
  quantity: number;
  discountType: 'none' | 'percentage' | 'fixed';
  discountValue: number;
  lineTotal: number;
}

interface CartStateData {
  lines: CartLine[];
  customerId: string | null;
  customerName: string | null;
  vehicleId: string | null;
  discountType: 'none' | 'percentage' | 'fixed';
  discountValue: number;
  paymentMethod: 'CASH' | 'CARD';
  cashTendered: number;
  note: string;
}

interface CartActions {
  addLine: (product: {
    serverId: string;
    name: string;
    sku: string;
    mnemonicSku: string;
    barcode: string | null;
    unitPrice: number;
  }, qty?: number) => void;
  updateQuantity: (lineId: string, qty: number) => void;
  removeLine: (lineId: string) => void;
  setLineDiscount: (lineId: string, type: 'none' | 'percentage' | 'fixed', value: number) => void;
  setCartDiscount: (type: 'none' | 'percentage' | 'fixed', value: number) => void;
  attachCustomer: (customerId: string, customerName: string, vehicleId?: string) => void;
  detachCustomer: () => void;
  setPaymentMethod: (method: 'CASH' | 'CARD') => void;
  setCashTendered: (amount: number) => void;
  setNote: (note: string) => void;
  clear: () => void;
}

type CartState = CartStateData & CartActions;

function computeLineTotal(line: Pick<CartLine, 'unitPrice' | 'quantity' | 'discountType' | 'discountValue'>): number {
  const gross = line.unitPrice * line.quantity;
  if (line.discountType === 'percentage') return gross * (1 - line.discountValue / 100);
  if (line.discountType === 'fixed') return gross - line.discountValue;
  return gross;
}

function persist(state: CartStateData): void {
  setJSON(storage, KEYS.CART_STATE, {
    lines: state.lines,
    customerId: state.customerId,
    customerName: state.customerName,
    vehicleId: state.vehicleId,
    discountType: state.discountType,
    discountValue: state.discountValue,
    paymentMethod: state.paymentMethod,
    cashTendered: state.cashTendered,
    note: state.note,
  });
}

function loadPersistedCart(): CartStateData {
  const saved = getJSON<CartStateData>(storage, KEYS.CART_STATE);
  if (saved && saved.lines && saved.lines.length > 0) return saved;
  return {
    lines: [],
    customerId: null,
    customerName: null,
    vehicleId: null,
    discountType: 'none',
    discountValue: 0,
    paymentMethod: 'CASH',
    cashTendered: 0,
    note: '',
  };
}

export const useCartStore = create<CartState>((set, get) => ({
  ...loadPersistedCart(),

  addLine: (product, qty = 1) => {
    set(state => {
      // If product already in cart, increment quantity
      const existing = state.lines.find(l => l.productId === product.serverId);
      let newLines: CartLine[];

      if (existing) {
        newLines = state.lines.map(l =>
          l.productId === product.serverId
            ? {
                ...l,
                quantity: l.quantity + qty,
                lineTotal: computeLineTotal({ ...l, quantity: l.quantity + qty }),
              }
            : l,
        );
      } else {
        const newLine: CartLine = {
          id: uuid(),
          productId: product.serverId,
          name: product.name,
          sku: product.sku,
          mnemonicSku: product.mnemonicSku,
          barcode: product.barcode,
          unitPrice: product.unitPrice,
          quantity: qty,
          discountType: 'none',
          discountValue: 0,
          lineTotal: product.unitPrice * qty,
        };
        newLines = [...state.lines, newLine];
      }

      const newState = { ...state, lines: newLines };
      persist(newState);
      return { lines: newLines };
    });
  },

  updateQuantity: (lineId, qty) => {
    set(state => {
      if (qty <= 0) {
        const newLines = state.lines.filter(l => l.id !== lineId);
        const newState = { ...state, lines: newLines };
        persist(newState);
        return { lines: newLines };
      }
      const newLines = state.lines.map(l =>
        l.id === lineId
          ? { ...l, quantity: qty, lineTotal: computeLineTotal({ ...l, quantity: qty }) }
          : l,
      );
      const newState = { ...state, lines: newLines };
      persist(newState);
      return { lines: newLines };
    });
  },

  removeLine: (lineId) => {
    set(state => {
      const newLines = state.lines.filter(l => l.id !== lineId);
      const newState = { ...state, lines: newLines };
      persist(newState);
      return { lines: newLines };
    });
  },

  setLineDiscount: (lineId, type, value) => {
    set(state => {
      const newLines = state.lines.map(l =>
        l.id === lineId
          ? {
              ...l,
              discountType: type,
              discountValue: value,
              lineTotal: computeLineTotal({ ...l, discountType: type, discountValue: value }),
            }
          : l,
      );
      const newState = { ...state, lines: newLines };
      persist(newState);
      return { lines: newLines };
    });
  },

  setCartDiscount: (type, value) => {
    set(state => {
      const newState = { ...state, discountType: type, discountValue: value };
      persist(newState);
      return { discountType: type, discountValue: value };
    });
  },

  attachCustomer: (customerId, customerName, vehicleId) => {
    set(state => {
      const newState = { ...state, customerId, customerName, vehicleId: vehicleId ?? null };
      persist(newState);
      return { customerId, customerName, vehicleId: vehicleId ?? null };
    });
  },

  detachCustomer: () => {
    set(state => {
      const newState = { ...state, customerId: null, customerName: null, vehicleId: null };
      persist(newState);
      return { customerId: null, customerName: null, vehicleId: null };
    });
  },

  setPaymentMethod: (method) => {
    set(state => {
      const newState = { ...state, paymentMethod: method };
      persist(newState);
      return { paymentMethod: method };
    });
  },

  setCashTendered: (amount) => {
    set(state => {
      const newState = { ...state, cashTendered: amount };
      persist(newState);
      return { cashTendered: amount };
    });
  },

  setNote: (note) => {
    set(state => {
      const newState = { ...state, note };
      persist(newState);
      return { note };
    });
  },

  clear: () => {
    const empty: CartStateData = {
      lines: [],
      customerId: null,
      customerName: null,
      vehicleId: null,
      discountType: 'none',
      discountValue: 0,
      paymentMethod: 'CASH',
      cashTendered: 0,
      note: '',
    };
    persist(empty);
    set(empty);
  },
}));

// Derived selectors
export const selectSubtotal = (state: CartState): number =>
  state.lines.reduce((sum, l) => sum + l.lineTotal, 0);

export const selectCartDiscount = (state: CartState): number => {
  const subtotal = selectSubtotal(state);
  if (state.discountType === 'percentage') return subtotal * (state.discountValue / 100);
  if (state.discountType === 'fixed') return state.discountValue;
  return 0;
};

export const selectGrandTotal = (state: CartState): number =>
  selectSubtotal(state) - selectCartDiscount(state);

export const selectChange = (state: CartState): number =>
  state.cashTendered - selectGrandTotal(state);

export const selectLineCount = (state: CartState): number =>
  state.lines.reduce((sum, l) => sum + l.quantity, 0);
```

**Step 2: Commit**

```bash
git add apps/mobile/src/stores/cart-store.ts
git commit -m "feat(mobile): add Zustand cart store with MMKV persistence"
```

---

### Task 13: Checkout Hook (Reconciliation-First)

**Files:**
- Create: `apps/mobile/src/hooks/use-checkout.ts`

**Step 1: Create checkout hook**

Create `apps/mobile/src/hooks/use-checkout.ts`:
```typescript
import { useState, useCallback } from 'react';
import { v4 as uuid } from 'uuid';
import { apiFetch, ApiError } from '@/services/api-client';
import { useCartStore, selectGrandTotal, selectSubtotal, selectCartDiscount } from '@/stores/cart-store';
import { addPendingSale, removePendingSale, updatePendingSale, getPendingSales } from '@/storage/pending-sales';

export type CheckoutStatus =
  | 'idle'
  | 'creating'
  | 'completing'
  | 'printing'
  | 'success'
  | 'pending_offline'
  | 'error';

interface CheckoutResult {
  saleId: string;
  saleNo: string;
  grandTotal: string;
}

export function useCheckout() {
  const [status, setStatus] = useState<CheckoutStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckoutResult | null>(null);

  const cart = useCartStore();
  const grandTotal = useCartStore(selectGrandTotal);
  const subtotal = useCartStore(selectSubtotal);
  const discountAmount = useCartStore(selectCartDiscount);

  const checkout = useCallback(async () => {
    if (cart.lines.length === 0) {
      setError('Cart is empty');
      return null;
    }

    setStatus('creating');
    setError(null);

    const idempotencyKey = uuid();

    try {
      // Step 1: Create OPEN sale
      const createPayload = {
        locationId: '', // filled by X-Location-ID header
        customerId: cart.customerId ?? undefined,
        customerVehicleId: cart.vehicleId ?? undefined,
        notes: cart.note || undefined,
        lines: cart.lines.map(l => ({
          productId: l.productId,
          quantity: l.quantity,
          discountAmount: l.discountType !== 'none'
            ? String(l.unitPrice * l.quantity - l.lineTotal)
            : undefined,
        })),
      };

      const sale = await apiFetch<any>('/sales', {
        method: 'POST',
        body: JSON.stringify(createPayload),
      });

      // Step 2: Complete sale with idempotency key
      setStatus('completing');

      const completePayload = {
        idempotencyKey,
        payments: [{
          method: cart.paymentMethod,
          amount: String(grandTotal.toFixed(2)),
        }],
      };

      // Store pending sale BEFORE attempting completion
      addPendingSale({
        idempotencyKey,
        saleId: sale.id,
        payload: completePayload,
        createdAt: new Date().toISOString(),
        attempts: 0,
        lastAttemptAt: null,
        status: 'pending',
      });

      const completed = await apiFetch<any>(`/sales/${sale.id}/complete`, {
        method: 'POST',
        body: JSON.stringify(completePayload),
      });

      // Success — remove from pending queue
      removePendingSale(idempotencyKey);

      const checkoutResult: CheckoutResult = {
        saleId: completed.id || sale.id,
        saleNo: completed.sale_no || completed.saleNo || sale.saleNo,
        grandTotal: String(grandTotal.toFixed(2)),
      };

      setResult(checkoutResult);
      setStatus('success');
      return checkoutResult;
    } catch (err: any) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          // Already processed — remove from pending, treat as success
          removePendingSale(idempotencyKey);
          setStatus('success');
          return null;
        }
        if (err.status === 0) {
          // Network error — sale is pending
          setStatus('pending_offline');
          setError('Sale saved. Will complete when online.');
          return null;
        }
        // Business error (4xx)
        removePendingSale(idempotencyKey);
        setStatus('error');
        setError(err.message);
        return null;
      }
      // Unknown error
      setStatus('error');
      setError(err.message || 'Checkout failed');
      return null;
    }
  }, [cart, grandTotal]);

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
    setResult(null);
  }, []);

  return { status, error, result, checkout, reset };
}

/**
 * Reconcile pending sales on reconnect.
 * Called by network listener when connectivity is restored.
 */
export async function reconcilePendingSales(): Promise<void> {
  const pending = getPendingSales();

  for (const sale of pending) {
    if (sale.status === 'reconciling') continue;

    updatePendingSale(sale.idempotencyKey, {
      status: 'reconciling',
      attempts: sale.attempts + 1,
      lastAttemptAt: new Date().toISOString(),
    });

    try {
      // Step 1: Check if sale already exists on server
      const existing = await apiFetch<any>(
        `/sales/by-idempotency-key/${encodeURIComponent(sale.idempotencyKey)}`,
      ).catch((err: ApiError) => {
        if (err.status === 404) return null;
        throw err;
      });

      if (existing) {
        // Sale already completed — remove from queue
        removePendingSale(sale.idempotencyKey);
        continue;
      }

      // Step 2: Sale never reached server — retry with same idempotency key
      const result = await apiFetch<any>(`/sales/${sale.saleId}/complete`, {
        method: 'POST',
        body: JSON.stringify(sale.payload),
      });

      // Success
      removePendingSale(sale.idempotencyKey);
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 409) {
        // Race condition — already processed
        removePendingSale(sale.idempotencyKey);
      } else if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        // Business error — flag for manual review
        updatePendingSale(sale.idempotencyKey, { status: 'failed' });
      } else {
        // Network still down — leave as pending
        updatePendingSale(sale.idempotencyKey, { status: 'pending' });
      }
    }
  }
}
```

**Step 2: Commit**

```bash
git add apps/mobile/src/hooks/use-checkout.ts
git commit -m "feat(mobile): add reconciliation-first checkout hook with pending sales queue"
```

---

## Phase D: Navigation & Screens

### Task 14: Navigation Setup

**Files:**
- Create: `apps/mobile/src/app/RootNavigator.tsx`
- Create: `apps/mobile/src/app/AuthStack.tsx`
- Create: `apps/mobile/src/app/MainTabs.tsx`
- Modify: `apps/mobile/App.tsx`

**Step 1: Create AuthStack**

Create `apps/mobile/src/app/AuthStack.tsx`:
```typescript
import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import LoginScreen from './screens/LoginScreen';
import ServerConfigScreen from './screens/ServerConfigScreen';

export type AuthStackParamList = {
  ServerConfig: undefined;
  Login: undefined;
};

const Stack = createStackNavigator<AuthStackParamList>();

export default function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ServerConfig" component={ServerConfigScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
    </Stack.Navigator>
  );
}
```

**Step 2: Create MainTabs**

Create `apps/mobile/src/app/MainTabs.tsx`:
```typescript
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';

// Screen imports (placeholder — implemented in subsequent tasks)
import CatalogScreen from './screens/CatalogScreen';
import CartScreen from './screens/CartScreen';
import TransactionListScreen from './screens/TransactionListScreen';
import TransactionDetailScreen from './screens/TransactionDetailScreen';
import SettingsScreen from './screens/SettingsScreen';
import PrinterSetupScreen from './screens/PrinterSetupScreen';

// ─── POS Stack ───
export type POSStackParamList = {
  Catalog: undefined;
  Cart: undefined;
};

const POSStack = createStackNavigator<POSStackParamList>();

function POSNavigator() {
  return (
    <POSStack.Navigator screenOptions={{ headerShown: false }}>
      <POSStack.Screen name="Catalog" component={CatalogScreen} />
      <POSStack.Screen name="Cart" component={CartScreen} />
    </POSStack.Navigator>
  );
}

// ─── Transactions Stack ───
export type TransactionsStackParamList = {
  TransactionList: undefined;
  TransactionDetail: { saleId: string };
};

const TxStack = createStackNavigator<TransactionsStackParamList>();

function TransactionsNavigator() {
  return (
    <TxStack.Navigator screenOptions={{ headerShown: false }}>
      <TxStack.Screen name="TransactionList" component={TransactionListScreen} />
      <TxStack.Screen name="TransactionDetail" component={TransactionDetailScreen} />
    </TxStack.Navigator>
  );
}

// ─── Settings Stack ───
export type SettingsStackParamList = {
  SettingsHome: undefined;
  PrinterSetup: undefined;
};

const SettingsStack = createStackNavigator<SettingsStackParamList>();

function SettingsNavigator() {
  return (
    <SettingsStack.Navigator screenOptions={{ headerShown: false }}>
      <SettingsStack.Screen name="SettingsHome" component={SettingsScreen} />
      <SettingsStack.Screen name="PrinterSetup" component={PrinterSetupScreen} />
    </SettingsStack.Navigator>
  );
}

// ─── Bottom Tabs ───
const Tab = createBottomTabNavigator();

export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#111318',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: { height: 60, paddingBottom: 8 },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}
    >
      <Tab.Screen
        name="POS"
        component={POSNavigator}
        options={{ tabBarLabel: 'POS' }}
      />
      <Tab.Screen
        name="Transactions"
        component={TransactionsNavigator}
        options={{ tabBarLabel: 'Transactions' }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsNavigator}
        options={{ tabBarLabel: 'Settings' }}
      />
    </Tab.Navigator>
  );
}
```

**Step 3: Create RootNavigator**

Create `apps/mobile/src/app/RootNavigator.tsx`:
```typescript
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { useAuth } from '@/hooks/use-auth';
import AuthStack from './AuthStack';
import MainTabs from './MainTabs';
import { ActivityIndicator, View } from 'react-native';

export default function RootNavigator() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#111318" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {isAuthenticated ? <MainTabs /> : <AuthStack />}
    </NavigationContainer>
  );
}
```

**Step 4: Update App.tsx entry point**

Update `apps/mobile/App.tsx`:
```typescript
import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/services/query-client';
import { AuthProvider } from '@/hooks/use-auth';
import { ScannerProviderComponent } from '@/hardware/scanner/context';
import { PrinterProviderComponent } from '@/hardware/printer/context';
import RootNavigator from '@/app/RootNavigator';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ScannerProviderComponent>
          <PrinterProviderComponent>
            <RootNavigator />
          </PrinterProviderComponent>
        </ScannerProviderComponent>
      </AuthProvider>
    </QueryClientProvider>
  );
}
```

**Step 5: Commit**

```bash
git add apps/mobile/src/app/ apps/mobile/App.tsx
git commit -m "feat(mobile): add navigation with Auth, POS, Transactions, Settings tabs"
```

---

### Task 15: Placeholder Screens

Create minimal placeholder screens so the app compiles. Each will be fleshed out in Tasks 16-20.

**Files:**
- Create: `apps/mobile/src/app/screens/LoginScreen.tsx`
- Create: `apps/mobile/src/app/screens/ServerConfigScreen.tsx`
- Create: `apps/mobile/src/app/screens/CatalogScreen.tsx`
- Create: `apps/mobile/src/app/screens/CartScreen.tsx`
- Create: `apps/mobile/src/app/screens/TransactionListScreen.tsx`
- Create: `apps/mobile/src/app/screens/TransactionDetailScreen.tsx`
- Create: `apps/mobile/src/app/screens/SettingsScreen.tsx`
- Create: `apps/mobile/src/app/screens/PrinterSetupScreen.tsx`

Each screen is a simple View + Text placeholder:

```typescript
// Example pattern for each:
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function ScreenName() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Screen Name</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  title: { fontSize: 18, fontWeight: '600', color: '#111318' },
});
```

**Step 1: Create all 8 placeholder screens**

(Each file follows the pattern above with appropriate names.)

**Step 2: Verify Android build compiles**

```bash
cd apps/mobile && npx react-native run-android
```

**Step 3: Commit**

```bash
git add apps/mobile/src/app/screens/
git commit -m "feat(mobile): add placeholder screens for all navigation routes"
```

---

### Task 16: ServerConfig & Login Screens

**Files:**
- Rewrite: `apps/mobile/src/app/screens/ServerConfigScreen.tsx`
- Rewrite: `apps/mobile/src/app/screens/LoginScreen.tsx`

**ServerConfigScreen** — First-launch / admin-only device provisioning:
- Text input for API base URL (defaults to `http://10.0.2.2:3000` on emulator)
- "Save & Continue" button stores URL in MMKV and navigates to Login
- Only shown when `KEYS.API_BASE_URL` is not set, or from Settings

**LoginScreen** — Credentials login:
- Email + password text inputs
- "Sign In" button calls `login()` from auth service
- Location selection dropdown after successful login (if multiple locations)
- Error display for invalid credentials

**Step 1: Implement ServerConfigScreen** (full code in file)

**Step 2: Implement LoginScreen** (full code in file)

**Step 3: Verify login flow works end-to-end with API**

**Step 4: Commit**

```bash
git add apps/mobile/src/app/screens/ServerConfigScreen.tsx apps/mobile/src/app/screens/LoginScreen.tsx
git commit -m "feat(mobile): implement ServerConfig and Login screens"
```

---

### Task 17: Catalog Screen (Dense List + Search + Scan)

**Files:**
- Rewrite: `apps/mobile/src/app/screens/CatalogScreen.tsx`
- Create: `apps/mobile/src/components/ProductListItem.tsx`
- Create: `apps/mobile/src/components/StockBadge.tsx`
- Create: `apps/mobile/src/hooks/use-catalog-search.ts`

**CatalogScreen design:**
- Dense list-first layout (not cards) — optimized for autoparts SKU scanning
- Search bar at top — queries WatermelonDB locally for instant results
- Barcode scan FAB button (bottom-right) — triggers ScannerProvider
- Category filter chips (horizontal scroll below search)
- Each row shows: SKU | Name | Price | Stock badge (green/yellow/red)
- Tap row → add to cart (qty 1), long-press → quantity picker
- Pull-to-refresh triggers delta sync
- Sync status indicator: subtle text showing last sync time (not noisy banner)

**ProductListItem design:**
- Single row: `[SKU] Product Name .............. ₱price [stock]`
- Minimum height 48dp for touch targets
- Swipe-right to quick-add to cart

**StockBadge:**
- Green dot: stock > reorderPoint
- Yellow dot: 0 < stock <= reorderPoint
- Red dot: stock = 0

**use-catalog-search hook:**
- Queries WatermelonDB with `Q.where` and `Q.like` for name/sku/barcode
- Returns observable results via `useObservable` from WatermelonDB
- Joins with local inventory table to get stock levels
- Falls back to server search if local DB is empty (first launch before sync)

**Step 1: Create use-catalog-search hook**

**Step 2: Create StockBadge component**

**Step 3: Create ProductListItem component**

**Step 4: Implement CatalogScreen**

**Step 5: Wire barcode scan → lookup product → add to cart**

**Step 6: Verify search works offline with local data**

**Step 7: Commit**

```bash
git add apps/mobile/src/app/screens/CatalogScreen.tsx apps/mobile/src/components/ apps/mobile/src/hooks/use-catalog-search.ts
git commit -m "feat(mobile): implement dense-list catalog screen with local search and barcode scan"
```

---

### Task 18: Cart Screen + Checkout Flow

**Files:**
- Rewrite: `apps/mobile/src/app/screens/CartScreen.tsx`
- Create: `apps/mobile/src/components/CartLineItem.tsx`
- Create: `apps/mobile/src/components/CustomerAttachModal.tsx`
- Create: `apps/mobile/src/components/CheckoutSuccessSheet.tsx`

**CartScreen design:**
- Header: "Cart" + item count + clear button
- Line items list with quantity stepper (+/−), swipe-to-remove
- Per-line discount (accessible via line item menu)
- Customer attachment via modal search (not a separate tab)
- Cart-level discount section
- Payment method selector: CASH | CARD
- Cash tendered input with auto-change calculation (only for CASH)
- "Charge ₱{total}" button → calls useCheckout hook
- Success: shows receipt summary, "Print" + "New Sale" buttons
- Offline: shows "Sale saved. Will complete when online." banner

**CustomerAttachModal:**
- Search input (queries server API, caches result in WatermelonDB recent_customers)
- Shows recent customers from local cache
- Select customer → optionally select vehicle → attach to cart

**Step 1: Create CartLineItem component**

**Step 2: Create CustomerAttachModal**

**Step 3: Create CheckoutSuccessSheet**

**Step 4: Implement CartScreen with checkout integration**

**Step 5: Verify full checkout flow: add items → charge → print → clear**

**Step 6: Commit**

```bash
git add apps/mobile/src/app/screens/CartScreen.tsx apps/mobile/src/components/
git commit -m "feat(mobile): implement cart screen with checkout, customer attach, and receipt printing"
```

---

### Task 19: Transaction List & Detail Screens

**Files:**
- Rewrite: `apps/mobile/src/app/screens/TransactionListScreen.tsx`
- Rewrite: `apps/mobile/src/app/screens/TransactionDetailScreen.tsx`
- Create: `apps/mobile/src/hooks/use-transactions.ts`
- Create: `apps/mobile/src/storage/recent-transactions.ts`

**TransactionListScreen:**
- Shows today's sales by default (fetched from server, cached locally)
- Local cache of recent completed transaction summaries (MMKV) for quick access
- Search by receipt number (SL-XXXXXX)
- Each row: receipt #, time, grand total, status badge, line count
- Tap → navigate to TransactionDetailScreen
- Pending offline sales shown at top with "Pending" badge

**TransactionDetailScreen:**
- Full receipt layout (mirrors printed receipt format)
- "Reprint" button → PrinterProvider.printReceipt()
- "Refund" button visible only for MANAGER/ADMIN — requires manager PIN
  - PIN validated server-side
  - Calls POST /sales/:id/refund with manager authentication
- Sale details: lines, payments, customer/vehicle info, timestamps

**Step 1: Create use-transactions hook (React Query + local cache)**

**Step 2: Create recent-transactions storage helpers**

**Step 3: Implement TransactionListScreen**

**Step 4: Implement TransactionDetailScreen with reprint**

**Step 5: Implement refund flow with manager PIN validation**

**Step 6: Commit**

```bash
git add apps/mobile/src/app/screens/Transaction* apps/mobile/src/hooks/use-transactions.ts apps/mobile/src/storage/recent-transactions.ts
git commit -m "feat(mobile): implement transaction list, detail, reprint, and refund flow"
```

---

### Task 20: Settings Screens

**Files:**
- Rewrite: `apps/mobile/src/app/screens/SettingsScreen.tsx`
- Rewrite: `apps/mobile/src/app/screens/PrinterSetupScreen.tsx`

**SettingsScreen:**
- Device info: app version, device ID, API URL
- Sync status: last catalog sync, last inventory sync, "Sync Now" button
- Pending sales count (if any) with reconcile button
- Online/offline state indicator
- Scanner mode selector: HID (default) | Camera
- Location switcher (if multiple locations available)
- Logout button

**PrinterSetupScreen:**
- "Scan for Printers" button → discover() → list found devices
- Each device: name, address, signal strength, "Connect" button
- Connected printer info + "Test Print" button + "Disconnect" button
- Paper width selector: 58mm | 80mm

**Step 1: Implement SettingsScreen**

**Step 2: Implement PrinterSetupScreen**

**Step 3: Verify printer discovery and test print**

**Step 4: Commit**

```bash
git add apps/mobile/src/app/screens/SettingsScreen.tsx apps/mobile/src/app/screens/PrinterSetupScreen.tsx
git commit -m "feat(mobile): implement settings and printer setup screens"
```

---

## Phase E: Connectivity & Polish

### Task 21: Network Monitor + Sync UX

**Files:**
- Create: `apps/mobile/src/services/network-monitor.ts`
- Create: `apps/mobile/src/hooks/use-network-status.ts`
- Create: `apps/mobile/src/components/SyncStatusBar.tsx`

**Network monitor:**
- Uses React Native's `NetInfo` to detect connectivity changes
- On reconnect: triggers reconcilePendingSales() + runFullSync()
- Exposes observable status: `{ isOnline: boolean; isReconnecting: boolean }`

**SyncStatusBar:**
- Calm, non-noisy design:
  - Online + recently synced: nothing shown (clean UI)
  - Online + stale (>5 min since sync): small subtle text "Last sync: 5m ago"
  - Offline: amber bar "Offline — working from local data"
  - Pending sales > 0: "1 pending sale" badge in Settings tab
- Never shows permanent banners when online and synced

**Step 1: Install @react-native-community/netinfo**

```bash
cd apps/mobile && pnpm add @react-native-community/netinfo
```

**Step 2: Create network monitor service**

**Step 3: Create useNetworkStatus hook**

**Step 4: Create SyncStatusBar component**

**Step 5: Integrate SyncStatusBar into MainTabs layout**

**Step 6: Commit**

```bash
git add apps/mobile/src/services/network-monitor.ts apps/mobile/src/hooks/use-network-status.ts apps/mobile/src/components/SyncStatusBar.tsx
git commit -m "feat(mobile): add network monitor with calm sync UX and offline indicators"
```

---

### Task 22: Theme & Design Tokens

**Files:**
- Create: `apps/mobile/src/theme/colors.ts`
- Create: `apps/mobile/src/theme/typography.ts`
- Create: `apps/mobile/src/theme/spacing.ts`
- Create: `apps/mobile/src/theme/index.ts`

Design tokens matching web app's dark-header, light-content aesthetic:
- Primary: #111318 (dark)
- Background: #ffffff
- Muted: #f4f4f5
- Success: #10b981 (stock OK)
- Warning: #f59e0b (low stock)
- Destructive: #ef4444 (out of stock, errors)
- Font: System default (platform native)
- Touch targets: minimum 48dp
- Border radius: 8dp

**Step 1: Create all theme files**

**Step 2: Commit**

```bash
git add apps/mobile/src/theme/
git commit -m "feat(mobile): add design tokens matching web app aesthetic"
```

---

### Task 23: Integration Testing & API Build Verification

**Step 1: Verify API build is clean**

```bash
cd apps/api && pnpm build
```

Expected: No errors. New sync routes and idempotency-key endpoint compile.

**Step 2: Test sync endpoint manually**

```bash
curl -H "Authorization: Bearer <token>" -H "X-Location-ID: <id>" http://localhost:3000/sync/catalog
curl -H "Authorization: Bearer <token>" -H "X-Location-ID: <id>" http://localhost:3000/sync/inventory
```

Expected: 200 with `{ data: [...], syncedAt: "...", count: N }`

**Step 3: Test idempotency key lookup**

```bash
curl -H "Authorization: Bearer <token>" -H "X-Location-ID: <id>" http://localhost:3000/sales/by-idempotency-key/nonexistent-key
```

Expected: 404 `{ error: "No sale found for this idempotency key" }`

**Step 4: Verify Android app builds and runs**

```bash
cd apps/mobile && npx react-native run-android
```

Expected: App launches, shows ServerConfig screen (first run) or Login screen.

**Step 5: Commit any fixes**

```bash
git add -A && git commit -m "fix(mobile): integration fixes from end-to-end testing"
```

---

## File Manifest

| File | Action | Task |
|------|--------|------|
| `pnpm-workspace.yaml` | Verify | 1 |
| `apps/mobile/` | Create (entire RN project) | 1 |
| `apps/mobile/package.json` | Create + modify | 1, 2 |
| `apps/mobile/tsconfig.json` | Create | 1 |
| `apps/mobile/babel.config.js` | Modify | 1 |
| `apps/mobile/App.tsx` | Rewrite | 14 |
| `apps/mobile/src/storage/mmkv.ts` | Create | 3 |
| `apps/mobile/src/storage/keys.ts` | Create | 3 |
| `apps/mobile/src/storage/pending-sales.ts` | Create | 3 |
| `apps/mobile/src/services/api-client.ts` | Create | 4 |
| `apps/mobile/src/services/query-client.ts` | Create | 4 |
| `apps/mobile/src/services/auth.ts` | Create | 5 |
| `apps/mobile/src/services/network-monitor.ts` | Create | 21 |
| `apps/mobile/src/hooks/use-auth.ts` | Create | 5 |
| `apps/mobile/src/hooks/use-checkout.ts` | Create | 13 |
| `apps/mobile/src/hooks/use-catalog-search.ts` | Create | 17 |
| `apps/mobile/src/hooks/use-transactions.ts` | Create | 19 |
| `apps/mobile/src/hooks/use-network-status.ts` | Create | 21 |
| `apps/mobile/src/db/schema.ts` | Create | 6 |
| `apps/mobile/src/db/database.ts` | Create | 6 |
| `apps/mobile/src/db/models/Product.ts` | Create | 6 |
| `apps/mobile/src/db/models/Inventory.ts` | Create | 6 |
| `apps/mobile/src/db/models/RecentCustomer.ts` | Create | 6 |
| `apps/mobile/src/db/models/index.ts` | Create | 6 |
| `apps/mobile/src/sync/catalog-sync.ts` | Create | 9 |
| `apps/mobile/src/sync/inventory-sync.ts` | Create | 9 |
| `apps/mobile/src/sync/sync-manager.ts` | Create | 9 |
| `apps/mobile/src/hardware/scanner/types.ts` | Create | 10 |
| `apps/mobile/src/hardware/scanner/hid-adapter.ts` | Create | 10 |
| `apps/mobile/src/hardware/scanner/camera-adapter.ts` | Create | 10 |
| `apps/mobile/src/hardware/scanner/mock-adapter.ts` | Create | 10 |
| `apps/mobile/src/hardware/scanner/context.tsx` | Create | 10 |
| `apps/mobile/src/hardware/printer/types.ts` | Create | 11 |
| `apps/mobile/src/hardware/printer/escpos-builder.ts` | Create | 11 |
| `apps/mobile/src/hardware/printer/bluetooth-adapter.ts` | Create | 11 |
| `apps/mobile/src/hardware/printer/mock-adapter.ts` | Create | 11 |
| `apps/mobile/src/hardware/printer/context.tsx` | Create | 11 |
| `apps/mobile/src/stores/cart-store.ts` | Create | 12 |
| `apps/mobile/src/storage/recent-transactions.ts` | Create | 19 |
| `apps/mobile/src/app/RootNavigator.tsx` | Create | 14 |
| `apps/mobile/src/app/AuthStack.tsx` | Create | 14 |
| `apps/mobile/src/app/MainTabs.tsx` | Create | 14 |
| `apps/mobile/src/app/screens/*.tsx` | Create (8 screens) | 15-20 |
| `apps/mobile/src/components/ProductListItem.tsx` | Create | 17 |
| `apps/mobile/src/components/StockBadge.tsx` | Create | 17 |
| `apps/mobile/src/components/CartLineItem.tsx` | Create | 18 |
| `apps/mobile/src/components/CustomerAttachModal.tsx` | Create | 18 |
| `apps/mobile/src/components/CheckoutSuccessSheet.tsx` | Create | 18 |
| `apps/mobile/src/components/SyncStatusBar.tsx` | Create | 21 |
| `apps/mobile/src/theme/*.ts` | Create (4 files) | 22 |
| `apps/api/src/modules/sync/service.ts` | Create | 7 |
| `apps/api/src/modules/sync/routes.ts` | Create | 7 |
| `apps/api/src/app.ts` | Modify (register sync) | 7 |
| `apps/api/src/modules/sales/service.ts` | Modify (add getSaleByIdempotencyKey) | 8 |
| `apps/api/src/modules/sales/routes.ts` | Modify (add lookup route) | 8 |

---

## Key Decisions Reference

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Cart persistence | Zustand + MMKV | Cart must survive app kills; MMKV is synchronous and fast |
| Top-level nav | POS, Transactions, Settings | Customers live inside POS flow as modal, not primary tab |
| Catalog UX | Dense list, not cards | Autoparts POS — SKU scanability > consumer browsing |
| Payment methods | CASH, CARD only (Phase 1) | Mixed payments deferred to avoid complexity |
| Refunds | Manager/Admin only + server PIN | Cashiers cannot execute refunds directly |
| Scanner capture | Explicit listen mode | HID input only captured when scanner is active, not during text input |
| Transaction cache | MMKV recent summaries | Quick reprint/review without server roundtrip |
| Sync UX | Calm — no permanent banners | Only show offline indicator when actually offline/stale |
| ServerConfig | First-launch + admin Settings | Not part of normal cashier workflow |
| costPrice | Never synced to mobile | Role-safe by default — cashiers never see cost data |
