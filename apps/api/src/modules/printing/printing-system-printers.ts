export const LIST_SYSTEM_PRINTERS_COMMAND =
  'powershell -NoProfile -Command "Get-Printer | Select-Object Name, PortName, DriverName, PrinterStatus | ConvertTo-Json -Compress"';

export function normalizeSystemPrinters(stdout: string): unknown[] {
  const parsed: unknown = JSON.parse(stdout.trim());
  return Array.isArray(parsed) ? parsed : [parsed];
}
