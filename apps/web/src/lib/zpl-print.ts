import { apiFetch } from "@/lib/api";

type SystemPrinter = {
  Name?: string;
  DriverName?: string;
};

type ConfiguredPrinter = {
  id: string;
  name?: string;
  isDefault: boolean;
  printerType?: "zpl" | "escpos";
  connectionType: string;
  ipAddress: string | null;
  port: number | null;
};

export type ZplPrintResult = {
  printed: boolean;
  mode: "system" | "configured-tcp" | "raw-preview";
  printerName?: string;
  error?: string;
};

type SendZplPrintJobInput = {
  locationId: string;
  token: string;
  zpl: string;
};

const ZEBRA_PRINTER_PATTERNS = [
  /zdesigner/i,
  /\bzebra\b/i,
  /\bzd\d+/i,
  /\bztc\b/i,
];

function isLikelyZebraPrinter(printer: SystemPrinter): boolean {
  const name = `${printer.Name ?? ""} ${printer.DriverName ?? ""}`;
  return ZEBRA_PRINTER_PATTERNS.some((pattern) => pattern.test(name));
}

export async function sendZplPrintJob({
  locationId,
  token,
  zpl,
}: SendZplPrintJobInput): Promise<ZplPrintResult> {
  const errors: string[] = [];

  try {
    const printers = await apiFetch<SystemPrinter[]>("/printing/system-printers", {
      token,
      locationId,
    });
    const zebra = printers.find(isLikelyZebraPrinter);

    if (zebra?.Name) {
      await apiFetch<{ success: boolean }>("/printing/system-print", {
        token,
        locationId,
        method: "POST",
        body: { printerName: zebra.Name, zpl },
      });

      return { printed: true, mode: "system", printerName: zebra.Name };
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "System printer failed");
  }

  try {
    const cfgRes = await apiFetch<{ data: ConfiguredPrinter[] }>(
      "/printing/printers",
      { token, locationId },
    );
    const zplPrinters = cfgRes.data.filter((printer) =>
      (printer.printerType ?? "zpl") === "zpl" &&
      printer.connectionType === "tcp" &&
      !!printer.ipAddress,
    );
    const selected = zplPrinters.find((printer) => printer.isDefault) ?? zplPrinters[0];

    if (selected) {
      await apiFetch<{ success: boolean }>("/printing/zpl/send", {
        token,
        locationId,
        method: "POST",
        body: { printerId: selected.id, zpl },
      });

      return {
        printed: true,
        mode: "configured-tcp",
        printerName: selected.name ?? selected.ipAddress ?? "TCP label printer",
      };
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Configured printer failed");
  }

  return {
    printed: false,
    mode: "raw-preview",
    error: errors[errors.length - 1],
  };
}

export function openZplPreview(zpl: string): void {
  const escaped = zpl
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const preview = window.open("", "_blank");

  if (!preview) return;

  preview.document.write(`
<!doctype html>
<html>
  <head>
    <title>ZPL Labels</title>
    <style>
      body {
        margin: 0;
        background: #f4f4f5;
        color: #18181b;
        font-family: Consolas, "Liberation Mono", monospace;
      }
      main {
        padding: 24px;
      }
      pre {
        margin: 0;
        border: 1px solid #d4d4d8;
        background: #fff;
        padding: 18px;
        white-space: pre-wrap;
        font-size: 12px;
        line-height: 1.5;
      }
    </style>
  </head>
  <body>
    <main><pre>${escaped}</pre></main>
  </body>
</html>`);
  preview.document.close();
}
