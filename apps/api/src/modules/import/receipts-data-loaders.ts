import { locations, products } from "@apex/database/schema";
import { and, eq, sql } from "drizzle-orm";
import {
  buildReceiptLocationNameMap,
  buildReceiptProductMap,
} from "./receipts-history-records";
import {
  buildReceiptLocationMapping,
  type ReceiptLocationRecord,
} from "./receipts-preview";
import type { ReceiptRow } from "./receipt-utils";
import type { LocationMapping } from "./types";

export interface ReceiptSkuLookupRow {
  sku: string | null;
}

export interface SavedReceiptLocationMappingRow {
  csv_location_name?: string | null;
  apex_location_id?: string | null;
}

async function getDatabase() {
  const { db } = await import("@apex/database");
  return db;
}

export function collectUniqueReceiptSkus(rows: ReceiptRow[]): string[] {
  return [...new Set(rows.map((row) => row.sku).filter(Boolean))];
}

export function buildMatchedReceiptSkus(
  uniqueSkus: string[],
  productRows: ReceiptSkuLookupRow[],
): Set<string> {
  const matchedSkus = new Set<string>();
  const existingSet = new Set(productRows.map((row) => row.sku?.toLowerCase()).filter(Boolean));

  for (const sku of uniqueSkus) {
    if (existingSet.has(sku.toLowerCase())) matchedSkus.add(sku);
  }

  return matchedSkus;
}

export function buildSavedReceiptLocationMappings(
  rows: Iterable<SavedReceiptLocationMappingRow>,
): Map<string, string> {
  const savedMappings = new Map<string, string>();

  for (const row of rows) {
    savedMappings.set(row.csv_location_name?.toLowerCase() as string, row.apex_location_id as string);
  }

  return savedMappings;
}

export async function loadMatchedReceiptSkus(orgId: string, rows: ReceiptRow[]): Promise<Set<string>> {
  const uniqueSkus = collectUniqueReceiptSkus(rows);
  if (uniqueSkus.length === 0) return new Set<string>();

  const db = await getDatabase();
  const existing = await db
    .select({ sku: products.sku })
    .from(products)
    .where(eq(products.orgId, orgId));

  return buildMatchedReceiptSkus(uniqueSkus, existing);
}

export async function loadSavedReceiptLocationMappings(orgId: string): Promise<Map<string, string>> {
  const db = await getDatabase();
  const savedMappingRows = await db.execute(
    sql`SELECT csv_location_name, apex_location_id FROM import_location_mappings WHERE org_id = ${orgId}`,
  );

  return buildSavedReceiptLocationMappings(savedMappingRows as Iterable<SavedReceiptLocationMappingRow>);
}

export async function loadActiveReceiptLocations(orgId: string): Promise<ReceiptLocationRecord[]> {
  const db = await getDatabase();
  return db
    .select({ id: locations.id, name: locations.name })
    .from(locations)
    .where(and(eq(locations.orgId, orgId), eq(locations.isActive, true)));
}

export async function loadReceiptPreviewLocationMapping(
  orgId: string,
  stores: string[],
): Promise<LocationMapping[]> {
  const savedMappings = await loadSavedReceiptLocationMappings(orgId);
  const allLocations = await loadActiveReceiptLocations(orgId);
  return buildReceiptLocationMapping(stores, savedMappings, allLocations);
}

export async function loadReceiptProductMap(orgId: string) {
  const db = await getDatabase();
  const allProducts = await db
    .select({ id: products.id, sku: products.sku, name: products.name })
    .from(products)
    .where(eq(products.orgId, orgId));

  return buildReceiptProductMap(allProducts);
}

export async function loadReceiptLocationNameMap(orgId: string): Promise<Map<string, string>> {
  const db = await getDatabase();
  const allLocations = await db
    .select({ id: locations.id, name: locations.name })
    .from(locations)
    .where(eq(locations.orgId, orgId));

  return buildReceiptLocationNameMap(allLocations);
}
