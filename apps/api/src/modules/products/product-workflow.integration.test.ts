import assert from "node:assert/strict";
import test from "node:test";

import { createApiIntegrationHarness } from "../../test/integration-harness";

test("product API create, list, update, and delete workflow", async (t) => {
  const harness = await createApiIntegrationHarness(t);
  if (!harness) return;

  const suffix = Math.random().toString(36).slice(2, 10).toUpperCase();
  const sku = `IT-${suffix}`;
  const name = `Integration Brake Pad ${suffix}`;
  const cashierHeaders = harness.authHeadersFor("CASHIER");

  const forbiddenCreateResponse = await harness.app.inject({
    method: "POST",
    url: "/products",
    headers: cashierHeaders,
    payload: {
      name: `Forbidden ${name}`,
      sku: `NOPE-${suffix}`,
      category: "HARD_PARTS",
    },
  });

  assert.equal(forbiddenCreateResponse.statusCode, 403, forbiddenCreateResponse.body);

  const missingSkuResponse = await harness.app.inject({
    method: "POST",
    url: "/products",
    headers: harness.authHeaders,
    payload: {
      name: `Missing SKU ${suffix}`,
      category: "HARD_PARTS",
      unitPrice: "10.00",
      costPrice: "5.00",
    },
  });

  assert.equal(missingSkuResponse.statusCode, 400, missingSkuResponse.body);

  const createResponse = await harness.app.inject({
    method: "POST",
    url: "/products",
    headers: harness.authHeaders,
    payload: {
      name,
      sku,
      category: "HARD_PARTS",
      unitPrice: "100.00",
      costPrice: "60.00",
      barcode: `BC-${suffix}`,
      trackInventory: true,
      initialStock: 4,
      locationIds: [harness.ids.locationId],
    },
  });

  assert.equal(createResponse.statusCode, 201, createResponse.body);
  const created = createResponse.json();
  assert.equal(created.name, name);
  assert.equal(created.sku, sku);

  const duplicateSkuResponse = await harness.app.inject({
    method: "POST",
    url: "/products",
    headers: harness.authHeaders,
    payload: {
      name: `Duplicate ${name}`,
      sku,
      category: "HARD_PARTS",
      unitPrice: "100.00",
      costPrice: "60.00",
    },
  });

  assert.equal(duplicateSkuResponse.statusCode, 409, duplicateSkuResponse.body);

  const listResponse = await harness.app.inject({
    method: "GET",
    url: `/products?search=${encodeURIComponent(sku)}`,
    headers: harness.authHeaders,
  });

  assert.equal(listResponse.statusCode, 200, listResponse.body);
  const listPayload = listResponse.json();
  assert.equal(listPayload.total, 1);
  assert.equal(listPayload.data[0].id, created.id);
  assert.equal(listPayload.data[0].stockLevel, 4);

  const allLocationsResponse = await harness.app.inject({
    method: "GET",
    url: `/products?allLocations=true&search=${encodeURIComponent(sku)}`,
    headers: harness.authHeaders,
  });

  assert.equal(allLocationsResponse.statusCode, 200, allLocationsResponse.body);
  const allLocationsPayload = allLocationsResponse.json();
  assert.equal(allLocationsPayload.total, 1);
  assert.equal(allLocationsPayload.data[0].stockLevel, 4);

  const groupedResponse = await harness.app.inject({
    method: "GET",
    url: `/products?grouped=true&search=${encodeURIComponent(sku)}`,
    headers: harness.authHeaders,
  });

  assert.equal(groupedResponse.statusCode, 200, groupedResponse.body);
  const groupedPayload = groupedResponse.json();
  assert.equal(groupedPayload.grouped, true);
  assert.equal(groupedPayload.total, 1);

  const groupedCountsResponse = await harness.app.inject({
    method: "GET",
    url: "/products/grouped-counts?groupBy=family",
    headers: harness.authHeaders,
  });

  assert.equal(groupedCountsResponse.statusCode, 200, groupedCountsResponse.body);
  const groupedCountsPayload = groupedCountsResponse.json();
  assert.ok(groupedCountsPayload.data.some((row: any) => row.name === "No Family" && row.itemCount >= 1));

  const forbiddenUpdateResponse = await harness.app.inject({
    method: "PATCH",
    url: `/products/${created.id}`,
    headers: cashierHeaders,
    payload: {
      name: "Cashier Rename",
    },
  });

  assert.equal(forbiddenUpdateResponse.statusCode, 403, forbiddenUpdateResponse.body);

  const updateResponse = await harness.app.inject({
    method: "PATCH",
    url: `/products/${created.id}`,
    headers: harness.authHeaders,
    payload: {
      name: `${name} Updated`,
      reorderPoint: 9,
    },
  });

  assert.equal(updateResponse.statusCode, 200, updateResponse.body);
  const updated = updateResponse.json();
  assert.equal(updated.name, `${name} Updated`);
  assert.equal(updated.reorderPoint, 9);

  const duplicateVariantSkuResponse = await harness.app.inject({
    method: "POST",
    url: "/products",
    headers: harness.authHeaders,
    payload: {
      name: `Variant Parent Duplicate ${suffix}`,
      category: "HARD_PARTS",
      variants: [
        { suffix: "LH", sku: `VAR-DUP-${suffix}`, unitPrice: "80.00", costPrice: "40.00" },
        { suffix: "RH", sku: `VAR-DUP-${suffix}`, unitPrice: "80.00", costPrice: "40.00" },
      ],
    },
  });

  assert.equal(duplicateVariantSkuResponse.statusCode, 400, duplicateVariantSkuResponse.body);

  const variantParentResponse = await harness.app.inject({
    method: "POST",
    url: "/products",
    headers: harness.authHeaders,
    payload: {
      name: `Variant Parent ${suffix}`,
      category: "HARD_PARTS",
      trackInventory: true,
      locationIds: [harness.ids.locationId],
      variants: [
        { suffix: "LH", sku: `VAR-LH-${suffix}`, unitPrice: "80.00", costPrice: "40.00", barcode: `VBC-LH-${suffix}` },
        { suffix: "RH", sku: `VAR-RH-${suffix}`, unitPrice: "80.00", costPrice: "40.00", barcode: `VBC-RH-${suffix}` },
      ],
    },
  });

  assert.equal(variantParentResponse.statusCode, 201, variantParentResponse.body);
  const variantParent = variantParentResponse.json();
  assert.equal(variantParent.isParent, true);
  assert.equal(variantParent.variants.length, 2);

  const variantDetailResponse = await harness.app.inject({
    method: "GET",
    url: `/products/${variantParent.id}`,
    headers: harness.authHeaders,
  });

  assert.equal(variantDetailResponse.statusCode, 200, variantDetailResponse.body);
  const variantDetail = variantDetailResponse.json();
  assert.equal(variantDetail.variants.length, 2);
  assert.deepEqual(
    variantDetail.variants.map((variant: any) => variant.sku).sort(),
    [`VAR-LH-${suffix}`, `VAR-RH-${suffix}`],
  );

  const forbiddenDeleteResponse = await harness.app.inject({
    method: "DELETE",
    url: `/products/${created.id}`,
    headers: cashierHeaders,
  });

  assert.equal(forbiddenDeleteResponse.statusCode, 403, forbiddenDeleteResponse.body);

  const deleteResponse = await harness.app.inject({
    method: "DELETE",
    url: `/products/${created.id}`,
    headers: harness.authHeaders,
  });

  assert.equal(deleteResponse.statusCode, 204, deleteResponse.body);

  const deletedListResponse = await harness.app.inject({
    method: "GET",
    url: `/products?search=${encodeURIComponent(sku)}`,
    headers: harness.authHeaders,
  });

  assert.equal(deletedListResponse.statusCode, 200, deletedListResponse.body);
  assert.equal(deletedListResponse.json().total, 0);

  const softDeleteSku = `SOFT-${suffix}`;
  const softCreateResponse = await harness.app.inject({
    method: "POST",
    url: "/products",
    headers: harness.authHeaders,
    payload: {
      name: `Referenced Product ${suffix}`,
      sku: softDeleteSku,
      category: "HARD_PARTS",
      unitPrice: "120.00",
      costPrice: "70.00",
      barcode: `SOFT-BC-${suffix}`,
      trackInventory: true,
      initialStock: 2,
      locationIds: [harness.ids.locationId],
    },
  });

  assert.equal(softCreateResponse.statusCode, 201, softCreateResponse.body);
  const referencedProduct = softCreateResponse.json();

  const [sale] = await harness.db
    .insert(harness.schema.sales)
    .values({
      orgId: harness.ids.orgId,
      saleNo: `SALE-${suffix}`,
      locationId: harness.ids.locationId,
      status: "COMPLETED",
      subtotal: "120.00",
      grandTotal: "120.00",
      createdByUserId: harness.ids.userId,
      completedByUserId: harness.ids.userId,
      completedAt: new Date(),
    })
    .returning();

  await harness.db.insert(harness.schema.saleLines).values({
    saleId: sale.id,
    orgId: harness.ids.orgId,
    productId: referencedProduct.id,
    locationId: harness.ids.locationId,
    quantity: 1,
    unitPrice: "120.00",
    lineTotal: "120.00",
  });

  const softDeleteResponse = await harness.app.inject({
    method: "DELETE",
    url: `/products/${referencedProduct.id}`,
    headers: harness.authHeaders,
  });

  assert.equal(softDeleteResponse.statusCode, 200, softDeleteResponse.body);
  assert.equal(softDeleteResponse.json().message, "Product deactivated (has transaction history)");

  const inactiveDetailResponse = await harness.app.inject({
    method: "GET",
    url: `/products/${referencedProduct.id}`,
    headers: harness.authHeaders,
  });

  assert.equal(inactiveDetailResponse.statusCode, 200, inactiveDetailResponse.body);
  assert.equal(inactiveDetailResponse.json().isActive, false);
});
