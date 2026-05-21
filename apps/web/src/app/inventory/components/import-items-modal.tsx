"use client";

import { Download, FileUp, Loader2 } from "lucide-react";
import { ModalShell } from "./modal-shell";
import type { InventoryImportExportController } from "../lib/use-inventory-import-export";

interface ImportItemsModalProps {
  importExport: InventoryImportExportController;
  onClose: () => void;
}

export function ImportItemsModal({ importExport, onClose }: ImportItemsModalProps) {
  return (
    <ModalShell title="Import Items" onClose={onClose} wide>
      {importExport.importStep === "upload" && (
        <div className="space-y-4">
          <button
            onClick={importExport.handleDownloadTemplate}
            className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-[12px] font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
          >
            <Download size={14} />
            Download CSV Template
          </button>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const file = e.dataTransfer.files[0];
              if (file) importExport.handleImportFileUpload(file);
            }}
            onClick={() => importExport.importFileRef.current?.click()}
            className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border p-8 text-center transition-colors hover:border-primary/40 hover:bg-muted/50"
          >
            <FileUp size={28} className="text-muted-foreground" />
            <p className="text-[13px] font-medium text-foreground">
              {importExport.importLoading ? "Processing..." : "Drop CSV file here or click to browse"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {importExport.importFile ? importExport.importFile.name : "Accepts .csv files"}
            </p>
            {importExport.importLoading && <Loader2 size={16} className="animate-spin text-muted-foreground" />}
          </div>
          <input
            ref={importExport.importFileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) importExport.handleImportFileUpload(file);
            }}
          />

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            <strong>Note:</strong> Items are matched by SKU. Rows with an existing SKU will update that item; rows without a matching SKU create new items.
          </div>
        </div>
      )}

      {importExport.importStep === "preview" && (
        <div className="space-y-4">
          {importExport.importStats && (
            <div className="flex items-center gap-2">
              {importExport.importStats.created > 0 && (
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                  {importExport.importStats.created} new
                </span>
              )}
              {importExport.importStats.updated > 0 && (
                <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                  {importExport.importStats.updated} updates
                </span>
              )}
              {importExport.importStats.errors > 0 && (
                <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">
                  {importExport.importStats.errors} errors
                </span>
              )}
            </div>
          )}

          <div className="max-h-64 overflow-auto rounded-lg border border-border">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 border-b border-border bg-muted/90">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">SKU</th>
                  <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Sell</th>
                  <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Cost</th>
                  <th className="px-2 py-1.5 text-center font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {importExport.importPreview.map((item, idx) => (
                  <tr key={`${item.row}-${idx}`} className={item.action === "error" ? "bg-red-50 dark:bg-red-950/20" : ""}>
                    <td className="max-w-[180px] truncate px-2 py-1.5 text-foreground">{item.name || item.raw?.name || "-"}</td>
                    <td className="px-2 py-1.5 font-mono text-muted-foreground">{item.sku || "-"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-foreground">{item.raw?.sellprice || item.raw?.unitprice || "-"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-foreground">{item.raw?.costprice || item.raw?.cost || "-"}</td>
                    <td className="px-2 py-1.5 text-center">
                      {item.action === "create" && (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">New</span>
                      )}
                      {item.action === "update" && (
                        <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">Update</span>
                      )}
                      {item.action === "error" && (
                        <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300" title={item.error}>Error</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              onClick={importExport.resetImport}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-[12px] font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={importExport.handleImportExecute}
              disabled={importExport.importLoading || (importExport.importStats?.created === 0 && importExport.importStats?.updated === 0)}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50"
            >
              {importExport.importLoading && <Loader2 size={13} className="animate-spin" />}
              Import {importExport.importStats ? importExport.importStats.created + importExport.importStats.updated : 0} Items
            </button>
          </div>
        </div>
      )}

      {importExport.importStep === "done" && (
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/40">
            <svg className="h-6 w-6 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <p className="text-[14px] font-semibold text-foreground">Import Complete</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {importExport.importStats?.created ?? 0} created, {importExport.importStats?.updated ?? 0} updated
              {(importExport.importStats?.errors ?? 0) > 0 && `, ${importExport.importStats?.errors ?? 0} errors`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg bg-primary px-4 py-1.5 text-[12px] font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98]"
          >
            Done
          </button>
        </div>
      )}
    </ModalShell>
  );
}
