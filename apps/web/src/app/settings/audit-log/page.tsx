"use client";

import { useState, useCallback } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Shield, Search, X, Loader2, ChevronDown } from "lucide-react";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { cn } from "@/lib/utils";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import { timeAgo } from "@/lib/format";

interface AuditLogRow {
  id: string;
  userId: string | null;
  userName: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  details: unknown;
  ipAddress: string | null;
  createdAt: string;
}

interface AuditLogPage {
  data: AuditLogRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

const ACTION_LABELS: Record<string, string> = {
  LOGIN: "Login",
  SALE_COMPLETE: "Sale Completed",
  SALE_VOID: "Sale Voided",
  SALE_REFUND: "Sale Refunded",
  PO_CREATE: "PO Created",
  PO_SUBMIT: "PO Submitted",
  PO_RECEIVE: "PO Received",
  PO_CLOSE: "PO Closed",
  RTV_CREATE: "RTV Created",
  RTV_SUBMIT: "RTV Submitted",
  PRODUCT_UPDATE: "Product Updated",
  PRODUCT_BULK_UPDATE: "Bulk Product Update",
  PRICE_CHANGE: "Price Changed",
  STOCK_ADJUST: "Stock Adjusted",
  SETTINGS_CHANGE: "Settings Changed",
};

const ACTION_COLORS: Record<string, string> = {
  LOGIN: "bg-blue-500/10 text-blue-600",
  SALE_COMPLETE: "bg-emerald-500/10 text-emerald-600",
  SALE_VOID: "bg-destructive/10 text-destructive",
  SALE_REFUND: "bg-orange-500/10 text-orange-600",
  PO_CREATE: "bg-indigo-500/10 text-indigo-600",
  PO_SUBMIT: "bg-violet-500/10 text-violet-600",
  PO_RECEIVE: "bg-green-500/10 text-green-600",
  PRODUCT_BULK_UPDATE: "bg-amber-500/10 text-amber-600",
};

export default function AuditLogPage() {
  const { token, locationId, user } = useAuth();
  const [actionFilter, setActionFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const query = useInfiniteQuery<AuditLogPage>({
    queryKey: ["audit-log", actionFilter, dateFrom, dateTo, locationId],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (actionFilter) params.set("action", actionFilter);
      if (dateFrom) params.set("from", `${dateFrom}T00:00:00Z`);
      if (dateTo) params.set("to", `${dateTo}T23:59:59Z`);
      if (pageParam) params.set("cursor", pageParam as string);
      params.set("limit", "50");
      const qs = params.toString();
      return apiFetch<AuditLogPage>(`/audit-log${qs ? `?${qs}` : ""}`, { token, locationId });
    },
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextCursor : undefined,
    initialPageParam: undefined as string | undefined,
    enabled: !!token && !!locationId,
  });

  const allRows = query.data?.pages.flatMap(p => p.data) ?? [];

  if (user?.role !== "ADMIN") {
    return (
      <div className="flex items-center justify-center py-32 text-muted-foreground text-sm">
        <Shield size={16} className="mr-2" /> Admin access required
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Audit Log</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Track user actions across the system</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
        >
          <option value="">All Actions</option>
          {Object.entries(ACTION_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <DateRangePicker
          startDate={dateFrom}
          endDate={dateTo}
          onChange={(start, end) => { setDateFrom(start); setDateTo(end); }}
        />
        {(actionFilter || dateFrom || dateTo) && (
          <button onClick={() => { setActionFilter(""); setDateFrom(""); setDateTo(""); }}
            className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
        )}
      </div>

      {/* Table */}
      {query.isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={20} className="animate-spin text-muted-foreground" />
        </div>
      ) : allRows.length === 0 ? (
        <div className="py-20 text-center text-sm text-muted-foreground">No audit log entries found</div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs font-medium text-muted-foreground">
              <tr>
                <th className="px-4 py-1.5 text-left w-40">Time</th>
                <th className="px-4 py-1.5 text-left">User</th>
                <th className="px-4 py-1.5 text-left">Action</th>
                <th className="px-4 py-1.5 text-left">Entity</th>
                <th className="px-4 py-1.5 text-left">IP</th>
                <th className="px-4 py-1.5 text-center w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {allRows.map((row) => (
                <>
                  <tr key={row.id} className="hover:bg-muted/20 cursor-pointer" onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}>
                    <td className="px-4 py-1.5 text-xs text-muted-foreground whitespace-nowrap" title={new Date(row.createdAt).toLocaleString()}>
                      {timeAgo(row.createdAt)}
                    </td>
                    <td className="px-4 py-1.5 font-medium text-foreground">{row.userName || "System"}</td>
                    <td className="px-4 py-1.5">
                      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold", ACTION_COLORS[row.action] || "bg-muted text-muted-foreground")}>
                        {ACTION_LABELS[row.action] || row.action}
                      </span>
                    </td>
                    <td className="px-4 py-1.5 text-xs text-muted-foreground">
                      {row.entityType && <span>{row.entityType}</span>}
                      {row.entityId && <span className="ml-1 font-mono text-[10px]">{row.entityId.slice(0, 8)}</span>}
                    </td>
                    <td className="px-4 py-1.5 text-xs text-muted-foreground font-mono">{row.ipAddress || "-"}</td>
                    <td className="px-4 py-1.5 text-center">
                      {row.details && <ChevronDown size={12} className={cn("text-muted-foreground transition-transform", expandedId === row.id && "rotate-180")} />}
                    </td>
                  </tr>
                  {expandedId === row.id && row.details && (
                    <tr key={`${row.id}-details`}>
                      <td colSpan={6} className="bg-muted/10 px-8 py-3">
                        <pre className="text-xs text-muted-foreground overflow-x-auto whitespace-pre-wrap font-mono">
                          {JSON.stringify(row.details, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>

          {/* Load more */}
          {query.hasNextPage && (
            <div className="border-t border-border px-4 py-3 text-center">
              <button
                onClick={() => query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
                className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
              >
                {query.isFetchingNextPage ? "Loading..." : "Load More"}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        {allRows.length > 0 && `Showing ${allRows.length} entries`}
      </div>
    </div>
  );
}
