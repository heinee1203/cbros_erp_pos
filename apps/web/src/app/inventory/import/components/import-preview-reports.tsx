import { Download, FileWarning } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  downloadPreviewErrorReport,
  downloadPreviewNoChangeReport,
  downloadPreviewSkippedReport,
  getPreviewErrorReportCount,
  getPreviewNoChangeReportCount,
  getPreviewSkippedReportCount,
} from "../import-report-utils";
import type { ImportMode, PreviewResponse } from "../types";

type ImportPreviewReportsProps = {
  preview: PreviewResponse;
  importMode: ImportMode;
};

export function ImportPreviewReports({ preview, importMode }: ImportPreviewReportsProps) {
  const reports = [
    {
      label: "Preview Errors",
      count: getPreviewErrorReportCount(preview),
      description: "Rows blocked by validation before import.",
      tone: "red",
      onDownload: () => downloadPreviewErrorReport(preview, importMode),
    },
    {
      label: "Skipped Rows",
      count: getPreviewSkippedReportCount(preview),
      description: "Rows that will not be imported from this preview.",
      tone: "amber",
      onDownload: () => downloadPreviewSkippedReport(preview, importMode),
    },
    {
      label: "No-Change Rows",
      count: getPreviewNoChangeReportCount(preview, importMode),
      description: "Rows with no allowed changes, including locked-only Update Only rows.",
      tone: "slate",
      onDownload: () => downloadPreviewNoChangeReport(preview, importMode),
    },
  ].filter((report) => report.count > 0);

  if (reports.length === 0) return null;

  return (
    <section className="rounded-lg border border-border bg-muted/40 p-4">
      <div className="mb-3 flex items-start gap-2">
        <FileWarning className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <div>
          <h3 className="text-sm font-semibold text-foreground">Download preview reports</h3>
          <p className="text-xs text-muted-foreground">
            CSV reports include row number, SKU, name, action, reason, changed fields, and locked
            fields where the preview has them.
          </p>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {reports.map((report) => (
          <button
            key={report.label}
            type="button"
            onClick={report.onDownload}
            className={cn(
              "flex items-center justify-between rounded-lg border bg-background px-3 py-2 text-left transition hover:bg-muted",
              report.tone === "red" && "border-red-200",
              report.tone === "amber" && "border-amber-200",
              report.tone === "slate" && "border-slate-200",
            )}
          >
            <span>
              <span className="block text-sm font-medium text-foreground">
                {report.label} ({report.count.toLocaleString()})
              </span>
              <span className="block text-xs text-muted-foreground">{report.description}</span>
            </span>
            <Download className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
}
