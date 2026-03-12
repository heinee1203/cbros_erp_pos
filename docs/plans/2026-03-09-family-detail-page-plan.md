# Family Detail Page — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a clickable family detail page showing editable family info and a simplified product list, and wire the families list page to real API data.

**Architecture:** Enrich existing `GET /products/families` with product counts via a subquery. Add 4 new API endpoints for family CRUD and product listing under a family. Create a new Next.js dynamic page at `/inventory/families/[slug]` with a hooks file. Replace mock data on the list page with real API calls.

**Tech Stack:** Fastify 5, Drizzle ORM, Next.js 15, React Query, Tailwind CSS

---

### Task 1: Enrich GET /products/families with product counts

**Files:**
- Modify: `apps/api/src/modules/products/routes.ts` (lines 402-416)

**Step 1: Update the existing families query to include productCount**

In `apps/api/src/modules/products/routes.ts`, replace the existing `GET /families` handler (lines 402-416) with:

```typescript
app.get("/families", async (request, reply) => {
  const { orgId } = request.storeContext!;

  const rows = await db
    .select({
      id: productFamilies.id,
      name: productFamilies.name,
      slug: productFamilies.slug,
      productCount: sql<number>`(
        SELECT count(*)::int FROM products
        WHERE products.family_id = ${productFamilies.id}
      )`,
    })
    .from(productFamilies)
    .where(eq(productFamilies.orgId, orgId))
    .orderBy(asc(productFamilies.name));

  return reply.send({ data: rows });
});
```

**Step 2: Verify the enriched endpoint works**

Run: `curl -s http://localhost:3000/products/families -H "Authorization: Bearer <token>" -H "X-Location-ID: <locationId>" | jq '.data[0]'`

Expected: Each family object now includes `productCount` as an integer.

**Step 3: Commit**

```bash
git add apps/api/src/modules/products/routes.ts
git commit -m "feat(api): enrich GET /families with productCount subquery"
```

---

### Task 2: Add GET /products/families/:slug endpoint

**Files:**
- Modify: `apps/api/src/modules/products/routes.ts` (insert after the GET /families handler)

**Step 1: Add the family detail endpoint**

Insert after the existing `GET /families` handler and before the closing `};` of the plugin:

```typescript
/**
 * GET /products/families/:slug
 * Get a single family by slug, with product count.
 */
app.get("/families/:slug", async (request, reply) => {
  const { orgId } = request.storeContext!;
  const { slug } = request.params as { slug: string };

  const [row] = await db
    .select({
      id: productFamilies.id,
      name: productFamilies.name,
      slug: productFamilies.slug,
      createdAt: productFamilies.createdAt,
      productCount: sql<number>`(
        SELECT count(*)::int FROM products
        WHERE products.family_id = ${productFamilies.id}
      )`,
    })
    .from(productFamilies)
    .where(and(eq(productFamilies.orgId, orgId), eq(productFamilies.slug, slug)))
    .limit(1);

  if (!row) {
    return reply.status(404).send({ error: `Family "${slug}" not found` });
  }

  return reply.send(row);
});
```

**Step 2: Commit**

```bash
git add apps/api/src/modules/products/routes.ts
git commit -m "feat(api): add GET /families/:slug detail endpoint"
```

---

### Task 3: Add GET /products/families/:slug/products endpoint

**Files:**
- Modify: `apps/api/src/modules/products/routes.ts`

**Step 1: Add the family products endpoint**

Insert after the `GET /families/:slug` handler:

```typescript
/**
 * GET /products/families/:slug/products
 * List all products belonging to a family (with stock at current location).
 */
app.get("/families/:slug/products", async (request, reply) => {
  const { orgId, locationId } = request.storeContext!;
  const { slug } = request.params as { slug: string };
  const q = request.query as { search?: string };

  // Resolve family by slug
  const [family] = await db
    .select({ id: productFamilies.id })
    .from(productFamilies)
    .where(and(eq(productFamilies.orgId, orgId), eq(productFamilies.slug, slug)))
    .limit(1);

  if (!family) {
    return reply.status(404).send({ error: `Family "${slug}" not found` });
  }

  const conditions: SQL[] = [
    eq(products.familyId, family.id),
    eq(inventory.locationId, locationId),
  ];

  if (q.search && q.search.length >= 2) {
    conditions.push(ilike(products.name, `%${q.search}%`));
  }

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      unitPrice: products.unitPrice,
      costPrice: products.costPrice,
      stockLevel: inventory.stockLevel,
      barcode: products.barcode,
    })
    .from(products)
    .innerJoin(inventory, and(eq(inventory.productId, products.id), eq(inventory.locationId, locationId)))
    .where(and(...conditions))
    .orderBy(asc(products.name));

  return reply.send({ data: rows });
});
```

**Step 2: Commit**

```bash
git add apps/api/src/modules/products/routes.ts
git commit -m "feat(api): add GET /families/:slug/products endpoint"
```

---

### Task 4: Add PATCH /products/families/:id and DELETE /products/families/:id endpoints

**Files:**
- Modify: `apps/api/src/modules/products/routes.ts`

**Step 1: Add PATCH endpoint for updating family name**

```typescript
/**
 * PATCH /products/families/:id
 * Update a family's name (slug auto-derived). Admin/Manager only.
 */
app.patch("/families/:id", async (request, reply) => {
  const { orgId } = request.storeContext!;
  const { role } = request.user!;
  if (!MANAGE_ROLES.includes(role)) {
    return reply.status(403).send({ error: "Forbidden" });
  }

  const { id } = request.params as { id: string };
  const { name } = request.body as { name: string };

  if (!name || name.trim().length === 0) {
    return reply.status(400).send({ error: "Name is required" });
  }

  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  const [updated] = await db
    .update(productFamilies)
    .set({ name: name.trim(), slug })
    .where(and(eq(productFamilies.id, id), eq(productFamilies.orgId, orgId)))
    .returning({ id: productFamilies.id, name: productFamilies.name, slug: productFamilies.slug });

  if (!updated) {
    return reply.status(404).send({ error: "Family not found" });
  }

  return reply.send(updated);
});
```

**Step 2: Add DELETE endpoint**

```typescript
/**
 * DELETE /products/families/:id
 * Delete a family. Products keep familyId = null (FK onDelete: set null).
 * Admin/Manager only.
 */
app.delete("/families/:id", async (request, reply) => {
  const { orgId } = request.storeContext!;
  const { role } = request.user!;
  if (!MANAGE_ROLES.includes(role)) {
    return reply.status(403).send({ error: "Forbidden" });
  }

  const { id } = request.params as { id: string };

  const [deleted] = await db
    .delete(productFamilies)
    .where(and(eq(productFamilies.id, id), eq(productFamilies.orgId, orgId)))
    .returning({ id: productFamilies.id });

  if (!deleted) {
    return reply.status(404).send({ error: "Family not found" });
  }

  return reply.send({ success: true });
});
```

**Step 3: Commit**

```bash
git add apps/api/src/modules/products/routes.ts
git commit -m "feat(api): add PATCH and DELETE endpoints for families"
```

---

### Task 5: Create frontend hooks for family detail

**Files:**
- Create: `apps/web/src/hooks/use-families.ts`
- Modify: `apps/web/src/hooks/use-products.ts` (update ProductFamily interface)

**Step 1: Update the ProductFamily interface in use-products.ts**

In `apps/web/src/hooks/use-products.ts`, update the `ProductFamily` interface (lines 162-166):

```typescript
export interface ProductFamily {
  id: string;
  name: string;
  slug: string;
  productCount: number;
}
```

**Step 2: Create use-families.ts**

```typescript
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

/* ─────────────────────────────────────────────
 * Types
 * ───────────────────────────────────────────── */

export interface FamilyDetail {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  productCount: number;
}

export interface FamilyProduct {
  id: string;
  name: string;
  sku: string;
  unitPrice: string;
  costPrice: string;
  stockLevel: number;
  barcode: string | null;
}

/* ─────────────────────────────────────────────
 * Hooks
 * ───────────────────────────────────────────── */

export function useFamilyDetail(token: string, locationId: string, slug: string) {
  return useQuery<FamilyDetail>({
    queryKey: ["family-detail", slug],
    queryFn: () =>
      apiFetch<FamilyDetail>(`/products/families/${slug}`, {
        token,
        locationId,
      }),
    enabled: !!token && !!locationId && !!slug,
    staleTime: 30_000,
  });
}

export function useFamilyProducts(token: string, locationId: string, slug: string, search?: string) {
  const params = new URLSearchParams();
  if (search && search.length >= 2) params.set("search", search);
  const qs = params.toString();

  return useQuery<{ data: FamilyProduct[] }>({
    queryKey: ["family-products", slug, search],
    queryFn: () =>
      apiFetch<{ data: FamilyProduct[] }>(`/products/families/${slug}/products${qs ? `?${qs}` : ""}`, {
        token,
        locationId,
      }),
    enabled: !!token && !!locationId && !!slug,
    staleTime: 30_000,
  });
}

export function useUpdateFamily(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      apiFetch<{ id: string; name: string; slug: string }>(`/products/families/${id}`, {
        token,
        locationId,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product-families"] });
      qc.invalidateQueries({ queryKey: ["family-detail"] });
    },
  });
}

export function useDeleteFamily(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean }>(`/products/families/${id}`, {
        token,
        locationId,
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product-families"] });
    },
  });
}
```

**Step 3: Commit**

```bash
git add apps/web/src/hooks/use-families.ts apps/web/src/hooks/use-products.ts
git commit -m "feat(web): add family detail, products, update, and delete hooks"
```

---

### Task 6: Create the family detail page

**Files:**
- Create: `apps/web/src/app/inventory/families/[slug]/page.tsx`

**Step 1: Create the detail page**

Build a full "use client" page at `apps/web/src/app/inventory/families/[slug]/page.tsx` with:

- **Header**: Back link to `/inventory/families`, family name (with inline edit on pencil click), slug subtitle, product count badge, created date, Edit/Delete buttons
- **Search bar**: filters products within the family
- **Products table**: columns — Name (clickable link to `/inventory?search={sku}`), SKU (monospace), Unit Price, Cost Price, Stock Level
- **Inline edit**: clicking Edit shows an input field to rename the family; Save/Cancel buttons
- **Delete**: confirmation dialog via `window.confirm()`, redirects to families list on success
- **Loading/error states**: skeleton shimmer while loading
- **Empty state**: "No products in this family" message

Use the hooks from `use-families.ts` (useFamilyDetail, useFamilyProducts, useUpdateFamily, useDeleteFamily) and `useAuth` from auth-context.

Follow the same design language as the existing families list page (rounded-xl cards, text-[13px], muted-foreground, primary/10 badges, etc.).

**Step 2: Commit**

```bash
git add apps/web/src/app/inventory/families/[slug]/page.tsx
git commit -m "feat(web): add family detail page with product list and edit/delete"
```

---

### Task 7: Wire families list page to real API data

**Files:**
- Modify: `apps/web/src/app/inventory/families/page.tsx`

**Step 1: Replace mock data with real API**

Replace the entire `apps/web/src/app/inventory/families/page.tsx` to:

- Import `useAuth` from auth-context and `useProductFamilies` from hooks
- Remove the hardcoded `FAMILIES` array
- Fetch real data via `useProductFamilies(token, locationId)`
- Make each family row a `<Link>` to `/inventory/families/${f.slug}`
- Keep the existing search/sort/UI layout but use real data
- Add loading skeleton while fetching
- The `ProductFamily` interface now includes `productCount`

**Step 2: Commit**

```bash
git add apps/web/src/app/inventory/families/page.tsx
git commit -m "feat(web): wire families list to real API, make rows clickable"
```

---

### Task 8: Verify end-to-end flow

**Step 1: Verify families list loads real data from API**

Navigate to `/inventory/families` — should show families from the database with real product counts.

**Step 2: Verify clicking a family navigates to detail page**

Click any family row — should navigate to `/inventory/families/{slug}` and show the family header + product list.

**Step 3: Verify product rows link to item list**

Click any product row — should navigate to `/inventory?search={sku}`.

**Step 4: Verify edit works**

Click Edit, change the name, save — family name and slug should update.

**Step 5: Verify delete works**

Click Delete, confirm — should remove the family and redirect to the list.

**Step 6: Final commit**

```bash
git add -A
git commit -m "feat: family detail page with product list, edit, and delete"
```
