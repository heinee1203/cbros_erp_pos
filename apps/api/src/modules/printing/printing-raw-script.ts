export function escapePowerShellSingleQuotedValue(value: string): string {
  return value.replace(/'/g, "''");
}

function escapePowerShellSingleQuotedPath(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "''");
}

export function buildRawPrintScript(
  printerName: string,
  filePath: string,
): string {
  const safePrinter = escapePowerShellSingleQuotedValue(printerName);
  const safeFile = escapePowerShellSingleQuotedPath(filePath);

  return `
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
}
