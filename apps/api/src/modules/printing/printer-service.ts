import { db } from "@apex/database";
import { printers } from "@apex/database/schema";
import { and, eq } from "drizzle-orm";

export type PrinterCreateInput = {
  name: string;
  connectionType: "tcp" | "bluetooth" | "usb";
  printerType?: "zpl" | "escpos";
  ipAddress?: string;
  port?: number;
  bluetoothMac?: string;
  labelWidthMm?: string;
  labelHeightMm?: string;
  dpmm?: number;
  darkness?: number;
  speed?: number;
  isDefault?: boolean;
};

export type PrinterUpdateInput = Partial<
  PrinterCreateInput & {
    printerType: "zpl" | "escpos";
  }
>;

async function clearDefaultPrinterForLocation(orgId: string, locationId?: string | null) {
  if (!locationId) {
    return;
  }

  await db
    .update(printers)
    .set({ isDefault: false })
    .where(and(eq(printers.orgId, orgId), eq(printers.locationId, locationId)));
}

export async function listPrintersForContext(
  orgId: string,
  locationId?: string | null,
) {
  return db
    .select()
    .from(printers)
    .where(
      and(
        eq(printers.orgId, orgId),
        ...(locationId ? [eq(printers.locationId, locationId)] : []),
      ),
    )
    .orderBy(printers.name);
}

export async function findPrinterById(orgId: string, printerId: string) {
  const [printer] = await db
    .select()
    .from(printers)
    .where(and(eq(printers.id, printerId), eq(printers.orgId, orgId)));

  return printer ?? null;
}

export async function createPrinterForContext({
  orgId,
  locationId,
  input,
}: {
  orgId: string;
  locationId?: string | null;
  input: PrinterCreateInput;
}) {
  if (input.isDefault) {
    await clearDefaultPrinterForLocation(orgId, locationId);
  }

  const [created] = await db
    .insert(printers)
    .values({
      orgId,
      locationId: locationId!,
      name: input.name,
      printerType: input.printerType ?? "zpl",
      connectionType: input.connectionType,
      ipAddress: input.ipAddress,
      port: input.port ?? 9100,
      bluetoothMac: input.bluetoothMac,
      labelWidthMm: input.labelWidthMm ?? "50",
      labelHeightMm: input.labelHeightMm ?? "30",
      dpmm: input.dpmm ?? 8,
      darkness: input.darkness ?? 15,
      speed: input.speed ?? 4,
      isDefault: input.isDefault ?? false,
    })
    .returning();

  return created;
}

export async function updatePrinterForContext({
  orgId,
  locationId,
  printerId,
  input,
}: {
  orgId: string;
  locationId?: string | null;
  printerId: string;
  input: PrinterUpdateInput;
}) {
  if (input.isDefault) {
    await clearDefaultPrinterForLocation(orgId, locationId);
  }

  const [updated] = await db
    .update(printers)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(printers.id, printerId), eq(printers.orgId, orgId)))
    .returning();

  return updated ?? null;
}

export async function deletePrinterForOrg(orgId: string, printerId: string) {
  const [deleted] = await db
    .delete(printers)
    .where(and(eq(printers.id, printerId), eq(printers.orgId, orgId)))
    .returning();

  return deleted ?? null;
}
