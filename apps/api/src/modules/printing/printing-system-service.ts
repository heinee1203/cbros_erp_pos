import { exec } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { buildRawPrintScript } from "./printing-raw-script";
import {
  LIST_SYSTEM_PRINTERS_COMMAND,
  normalizeSystemPrinters,
} from "./printing-system-printers";

const execAsync = promisify(exec);

export async function listSystemPrinters() {
  const { stdout } = await execAsync(LIST_SYSTEM_PRINTERS_COMMAND, {
    timeout: 10_000,
  });
  return normalizeSystemPrinters(stdout);
}

export async function printZplToSystemPrinter(printerName: string, zpl: string) {
  const tempZpl = join(tmpdir(), `zpl-${randomUUID()}.txt`);
  const tempPs1 = join(tmpdir(), `print-${randomUUID()}.ps1`);

  await writeFile(tempZpl, zpl, "utf-8");

  const psContent = buildRawPrintScript(printerName, tempZpl);
  await writeFile(tempPs1, psContent, "utf-8");

  try {
    await execAsync(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${tempPs1}"`,
      { timeout: 15_000 },
    );
  } finally {
    await unlink(tempZpl).catch(() => {});
    await unlink(tempPs1).catch(() => {});
  }
}
