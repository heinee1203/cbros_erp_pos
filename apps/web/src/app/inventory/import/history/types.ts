export type Step = "upload" | "parsing" | "preview" | "progress" | "results";

export type ReasonType = "Sale" | "Refund" | "PO Receipt" | "Transfer" | "Count" | "Damage" | "Loss";

export type ImportableReasonType = Exclude<ReasonType, "Sale" | "Refund">;

export interface ReasonBreakdown {
  reason: string;
  count: number;
}

export interface LocationMatch {
  csvName: string;
  apexId: string | null;
  apexName: string | null;
  matched: boolean;
}

export interface PreviewResponse {
  previewToken: string;
  summary: {
    totalRows: number;
    dateRange: { from: string; to: string };
    reasonBreakdown: ReasonBreakdown[];
    skuMatchRate: number;
    matchedSkus: number;
    totalSkus: number;
    unmatchedSkus: string[];
  };
  locations: LocationMatch[];
}

export interface ProgressResponse {
  status: "running" | "done" | "error";
  processed: number;
  total: number;
  imported: number;
  skipped: number;
  errors: number;
  byReason?: Record<string, number>;
  errorLog?: { row: number; message: string }[];
  durationMs?: number;
}

export interface LocationOption {
  id: string;
  name: string;
}

export interface ImportBatch {
  id: string;
  importedAt: string;
  rowCount: number;
  dateRangeFrom: string;
  dateRangeTo: string;
}
