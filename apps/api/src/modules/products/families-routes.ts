import type { FastifyInstance } from "fastify";
import { db } from "@apex/database";
import { categories, inventory, productFamilies, products } from "@apex/database/schema";
import { and, asc, eq, ilike, sql, type SQL } from "drizzle-orm";

import { MANAGE_ROLES } from "./permissions";

export function registerProductFamilyRoutes(app: FastifyInstance) {
  app.get("/families", async (request, reply) => {
    const { orgId } = request.storeContext!;

    const rows = await db
      .select({
        id: productFamilies.id,
        name: productFamilies.name,
        slug: productFamilies.slug,
        productCount: sql<number>`(
          SELECT count(*)::int FROM products p
          LEFT JOIN categories c ON p.category_id = c.id
          WHERE (p.family_id = "product_families"."id" OR c.family_id = "product_families"."id")
        )`,
      })
      .from(productFamilies)
      .where(eq(productFamilies.orgId, orgId))
      .orderBy(asc(productFamilies.name));

    return reply.send({ data: rows });
  });

  app.post("/families", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user!;
    if (!MANAGE_ROLES.includes(role)) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const { name } = request.body as { name: string };
    if (!name || name.trim().length === 0) {
      return reply.status(400).send({ error: "Name is required" });
    }

    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

    const existing = await db
      .select({ id: productFamilies.id })
      .from(productFamilies)
      .where(and(eq(productFamilies.orgId, orgId), eq(productFamilies.slug, slug)))
      .limit(1);

    if (existing.length > 0) {
      return reply.status(409).send({ error: `Family with slug "${slug}" already exists` });
    }

    const [created] = await db
      .insert(productFamilies)
      .values({ orgId, name: name.trim(), slug })
      .returning({ id: productFamilies.id, name: productFamilies.name, slug: productFamilies.slug });

    return reply.status(201).send(created);
  });

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
          SELECT count(*)::int FROM products p
          LEFT JOIN categories c ON p.category_id = c.id
          WHERE (p.family_id = "product_families"."id" OR c.family_id = "product_families"."id")
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

  app.get("/families/:slug/products", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const { slug } = request.params as { slug: string };
    const q = request.query as { search?: string };

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
      ...(locationId ? [eq(inventory.locationId, locationId)] : []),
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
        oemNumber: products.oemNumber,
      })
      .from(products)
      .leftJoin(inventory, and(
        eq(inventory.productId, products.id),
        ...(locationId ? [eq(inventory.locationId, locationId)] : []),
      ))
      .where(and(...conditions))
      .orderBy(asc(products.name));

    return reply.send({ data: rows });
  });

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
}
