import type { FastifyInstance } from "fastify";
import * as net from "node:net";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { db } from "@apex/database";
import { printers } from "@apex/database/schema";
import { eq, and } from "drizzle-orm";

const execAsync = promisify(exec);

/* ─── Helper: Send raw data to a TCP printer ─── */

async function sendTcp(
  host: string,
  port: number,
  data: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    const timeout = setTimeout(() => {
      client.destroy();
      reject(new Error(`Connection timeout to ${host}:${port}`));
    }, 10_000);

    client.connect(port, host, () => {
      client.write(data, (err) => {
        clearTimeout(timeout);
        if (err) {
          client.destroy();
          reject(err);
        } else {
          client.end(() => resolve());
        }
      });
    });

    client.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

export async function printingRoutes(app: FastifyInstance) {
  /* ─────────────────────────────────────────────
   * PRINTERS CRUD
   * ───────────────────────────────────────────── */

  /** GET /printing/printers — list printers for current location */
  app.get("/printers", async (request) => {
    const { orgId, locationId } = request.storeContext!;
    const rows = await db
      .select()
      .from(printers)
      .where(
        and(
          eq(printers.orgId, orgId),
          ...(locationId ? [eq(printers.locationId, locationId)] : []),
        ),
      )
      .orderBy(printers.name);
    return { data: rows };
  });

  /** GET /printing/printers/:id — single printer */
  app.get<{ Params: { id: string } }>("/printers/:id", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const [row] = await db
      .select()
      .from(printers)
      .where(and(eq(printers.id, request.params.id), eq(printers.orgId, orgId)));
    if (!row) return reply.status(404).send({ error: "Printer not found" });
    return row;
  });

  /** POST /printing/printers — create printer */
  app.post<{
    Body: {
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
  }>("/printers", async (request) => {
    const { orgId, locationId } = request.storeContext!;
    const body = request.body;

    // If setting as default, unset other defaults at this location
    if (body.isDefault && locationId) {
      await db
        .update(printers)
        .set({ isDefault: false })
        .where(
          and(eq(printers.orgId, orgId), eq(printers.locationId, locationId)),
        );
    }

    const [created] = await db
      .insert(printers)
      .values({
        orgId,
        locationId: locationId!,
        name: body.name,
        printerType: body.printerType ?? "zpl",
        connectionType: body.connectionType,
        ipAddress: body.ipAddress,
        port: body.port ?? 9100,
        bluetoothMac: body.bluetoothMac,
        labelWidthMm: body.labelWidthMm ?? "50",
        labelHeightMm: body.labelHeightMm ?? "30",
        dpmm: body.dpmm ?? 8,
        darkness: body.darkness ?? 15,
        speed: body.speed ?? 4,
        isDefault: body.isDefault ?? false,
      })
      .returning();

    return created;
  });

  /** PUT /printing/printers/:id — update printer */
  app.put<{
    Params: { id: string };
    Body: Partial<{
      name: string;
      connectionType: "tcp" | "bluetooth" | "usb";
      printerType: "zpl" | "escpos";
      ipAddress: string;
      port: number;
      bluetoothMac: string;
      labelWidthMm: string;
      labelHeightMm: string;
      dpmm: number;
      darkness: number;
      speed: number;
      isDefault: boolean;
    }>;
  }>("/printers/:id", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const body = request.body;

    // If setting as default, unset other defaults
    if (body.isDefault && locationId) {
      await db
        .update(printers)
        .set({ isDefault: false })
        .where(
          and(eq(printers.orgId, orgId), eq(printers.locationId, locationId)),
        );
    }

    const [updated] = await db
      .update(printers)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(printers.id, request.params.id), eq(printers.orgId, orgId)))
      .returning();

    if (!updated) return reply.status(404).send({ error: "Printer not found" });
    return updated;
  });

  /** DELETE /printing/printers/:id */
  app.delete<{ Params: { id: string } }>(
    "/printers/:id",
    async (request, reply) => {
      const { orgId } = request.storeContext!;
      const [deleted] = await db
        .delete(printers)
        .where(
          and(
            eq(printers.id, request.params.id),
            eq(printers.orgId, orgId),
          ),
        )
        .returning();
      if (!deleted)
        return reply.status(404).send({ error: "Printer not found" });
      return { success: true };
    },
  );

  /* ─────────────────────────────────────────────
   * PRINT: Send ZPL to printer
   * ───────────────────────────────────────────── */

  /** POST /printing/zpl — send raw ZPL to a network printer */
  app.post<{
    Body: { zpl: string; printerIp: string; port?: number };
  }>(
    "/zpl",
    {
      schema: {
        body: {
          type: "object",
          required: ["zpl", "printerIp"],
          properties: {
            zpl: { type: "string", minLength: 1, maxLength: 500_000 },
            printerIp: { type: "string", minLength: 1 },
            port: { type: "number", minimum: 1, maximum: 65535 },
          },
        },
      },
    },
    async (request, reply) => {
      const { zpl, printerIp, port = 9100 } = request.body;

      if (
        !/^[\d.]+$/.test(printerIp) &&
        !/^[a-zA-Z0-9.-]+$/.test(printerIp)
      ) {
        return reply
          .status(400)
          .send({ error: "Invalid printer IP/hostname" });
      }

      try {
        await sendTcp(printerIp, port, zpl);
        return { success: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        request.log.error({ err, printerIp, port }, "ZPL print failed");
        return reply
          .status(502)
          .send({ error: `Printer connection failed: ${msg}` });
      }
    },
  );

  /** POST /printing/zpl/send — send ZPL to a configured printer by ID */
  app.post<{
    Body: { zpl: string; printerId: string };
  }>(
    "/zpl/send",
    {
      schema: {
        body: {
          type: "object",
          required: ["zpl", "printerId"],
          properties: {
            zpl: { type: "string", minLength: 1, maxLength: 500_000 },
            printerId: { type: "string", minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const { orgId } = request.storeContext!;
      const { zpl, printerId } = request.body;

      const [printer] = await db
        .select()
        .from(printers)
        .where(and(eq(printers.id, printerId), eq(printers.orgId, orgId)));

      if (!printer) {
        return reply.status(404).send({ error: "Printer not found" });
      }

      if (printer.connectionType !== "tcp") {
        return reply.status(400).send({
          error: `Printer "${printer.name}" uses ${printer.connectionType} — only TCP printing is supported from the server`,
        });
      }

      if (!printer.ipAddress) {
        return reply
          .status(400)
          .send({ error: "Printer has no IP address configured" });
      }

      try {
        await sendTcp(printer.ipAddress, printer.port ?? 9100, zpl);
        return { success: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        request.log.error(
          { err, printerId, ip: printer.ipAddress },
          "ZPL print failed",
        );
        return reply
          .status(502)
          .send({ error: `Printer connection failed: ${msg}` });
      }
    },
  );

  /** POST /printing/zpl/test — send a test label */
  app.post<{
    Body: { printerIp: string; port?: number };
  }>(
    "/zpl/test",
    {
      schema: {
        body: {
          type: "object",
          required: ["printerIp"],
          properties: {
            printerIp: { type: "string", minLength: 1 },
            port: { type: "number", minimum: 1, maximum: 65535 },
          },
        },
      },
    },
    async (request, reply) => {
      const { printerIp, port = 9100 } = request.body;

      const testZPL = `^XA
^CI28
^PW400
^LL240
^FO10,20^A0N,30,30^FDCBROS POS^FS
^FO10,60^A0N,22,22^FDTest Label^FS
^FO10,100^A0N,18,18^FD${new Date().toISOString().slice(0, 19)}^FS
^FO20,140^BY2,2,60^BCN,60,Y,N,N^FD1234567890^FS
^XZ
`;

      try {
        await sendTcp(printerIp, port, testZPL);
        return { success: true, message: "Test label sent" };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        return reply
          .status(502)
          .send({ error: `Printer connection failed: ${msg}` });
      }
    },
  );

  /* ─────────────────────────────────────────────
   * ZPL PREVIEW — Labelary API proxy
   * ───────────────────────────────────────────── */

  /** POST /printing/preview — render ZPL to PNG via Labelary API */
  app.post<{
    Body: {
      zpl: string;
      widthMm?: number;
      heightMm?: number;
      dpmm?: number;
    };
  }>(
    "/preview",
    {
      schema: {
        body: {
          type: "object",
          required: ["zpl"],
          properties: {
            zpl: { type: "string", minLength: 1, maxLength: 500_000 },
            widthMm: { type: "number" },
            heightMm: { type: "number" },
            dpmm: { type: "number" },
          },
        },
      },
    },
    async (request, reply) => {
      const { zpl, widthMm = 50, heightMm = 30, dpmm = 8 } = request.body;

      // Convert mm to inches for Labelary API
      const widthIn = (widthMm / 25.4).toFixed(2);
      const heightIn = (heightMm / 25.4).toFixed(2);

      const url = `http://api.labelary.com/v1/printers/${dpmm}dpmm/labels/${widthIn}x${heightIn}/0/`;

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            Accept: "image/png",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: zpl,
        });

        if (!response.ok) {
          return reply
            .status(502)
            .send({ error: `Labelary API error: ${response.status}` });
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        const base64 = buffer.toString("base64");
        return { image: `data:image/png;base64,${base64}` };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        return reply
          .status(502)
          .send({ error: `Preview generation failed: ${msg}` });
      }
    },
  );

  /* ─────────────────────────────────────────────
   * SYSTEM PRINTERS — list Windows printers via PowerShell
   * ───────────────────────────────────────────── */

  /** GET /printing/system-printers — list printers installed on this Windows machine */
  app.get("/system-printers", async (_request, reply) => {
    try {
      const { stdout } = await execAsync(
        'powershell -NoProfile -Command "Get-Printer | Select-Object Name, PortName, DriverName, PrinterStatus | ConvertTo-Json -Compress"',
        { timeout: 10_000 },
      );
      const parsed = JSON.parse(stdout.trim());
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return reply
        .status(500)
        .send({ error: `Failed to list printers: ${msg}` });
    }
  });

  /* ─────────────────────────────────────────────
   * SYSTEM PRINT — send raw ZPL to a named Windows printer
   * Uses Win32 spooler API via PowerShell + inline C# (RAW datatype)
   * ───────────────────────────────────────────── */

  /** POST /printing/system-print — send raw ZPL to a named Windows printer */
  app.post<{
    Body: { printerName: string; zpl: string };
  }>(
    "/system-print",
    {
      schema: {
        body: {
          type: "object",
          required: ["printerName", "zpl"],
          properties: {
            printerName: { type: "string", minLength: 1 },
            zpl: { type: "string", minLength: 1, maxLength: 500_000 },
          },
        },
      },
    },
    async (request, reply) => {
      const { printerName, zpl } = request.body;

      // Write ZPL to a temp file
      const tempZpl = join(tmpdir(), `zpl-${randomUUID()}.txt`);
      const tempPs1 = join(tmpdir(), `print-${randomUUID()}.ps1`);

      await writeFile(tempZpl, zpl, "utf-8");

      // Build PowerShell script that uses C# RawPrinterHelper to send RAW data
      const safePrinter = printerName.replace(/'/g, "''");
      const safeFile = tempZpl.replace(/\\/g, "\\\\").replace(/'/g, "''");

      const psContent = `
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;

public class RawPrinterHelper
{
    [StructLayout(LayoutKind.Sequential)]
    public struct DOCINFOA
    {
        public string pDocName;
        public string pOutputFile;
        public string pDatatype;
    }

    [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", CharSet=CharSet.Ansi, SetLastError=true)]
    public static extern bool OpenPrinter(string p, out IntPtr hP, IntPtr d);

    [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true)]
    public static extern bool ClosePrinter(IntPtr hP);

    [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", CharSet=CharSet.Ansi, SetLastError=true)]
    public static extern bool StartDocPrinter(IntPtr hP, int l, ref DOCINFOA di);

    [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true)]
    public static extern bool EndDocPrinter(IntPtr hP);

    [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true)]
    public static extern bool StartPagePrinter(IntPtr hP);

    [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true)]
    public static extern bool EndPagePrinter(IntPtr hP);

    [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true)]
    public static extern bool WritePrinter(IntPtr hP, IntPtr pBytes, int dwCount, out int dwWritten);

    public static bool SendFileToPrinter(string printerName, string filePath)
    {
        IntPtr hPrinter;
        DOCINFOA di = new DOCINFOA() { pDocName = "ZPL Label", pDatatype = "RAW" };
        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) return false;
        try
        {
            if (!StartDocPrinter(hPrinter, 1, ref di)) return false;
            if (!StartPagePrinter(hPrinter)) { EndDocPrinter(hPrinter); return false; }
            byte[] bytes = File.ReadAllBytes(filePath);
            IntPtr pBytes = Marshal.AllocCoTaskMem(bytes.Length);
            Marshal.Copy(bytes, 0, pBytes, bytes.Length);
            int written;
            bool ok = WritePrinter(hPrinter, pBytes, bytes.Length, out written);
            Marshal.FreeCoTaskMem(pBytes);
            EndPagePrinter(hPrinter);
            EndDocPrinter(hPrinter);
            return ok;
        }
        finally { ClosePrinter(hPrinter); }
    }
}
'@

$result = [RawPrinterHelper]::SendFileToPrinter('${safePrinter}', '${safeFile}')
if (-not $result) { exit 1 }
`;

      await writeFile(tempPs1, psContent, "utf-8");

      try {
        await execAsync(
          `powershell -NoProfile -ExecutionPolicy Bypass -File "${tempPs1}"`,
          { timeout: 15_000 },
        );
        return { success: true, printer: printerName };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        request.log.error({ err, printerName }, "System print failed");
        return reply
          .status(500)
          .send({ error: `Print failed: ${msg}` });
      } finally {
        await unlink(tempZpl).catch(() => {});
        await unlink(tempPs1).catch(() => {});
      }
    },
  );
}
