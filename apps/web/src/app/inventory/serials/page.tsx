"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Package, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

/* ─── Types ─── */
interface SerialResult {
  id: string;
  serialNumber: string;
  productId: string;
  productName: string;
  sku: string;
  status: "IN_STOCK" | "SOLD" | "RETURNED" | "DEFECTIVE" | "RTV";
  locationId: string | null;
  locationName: string | null;
  receivedAt: string | null;
  receivedSource: string | null;
  soldAt: string | null;
  saleId: string | null;
  saleNumber: string | null;
  customerName: string | null;
}

/* ─── Status Badge ─── */
const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  IN_STOCK:  { bg: "bg-emerald-500/15", text: "text-emerald-600" },
  SOLD:      { bg: "bg-blue-500/15",    text: "text-blue-600" },
  RETURNED:  { bg: "bg-purple-500/15",  text: "text-purple-600" },
  DEFECTIVE: { bg: "bg-red-500/15",     text: "text-red-600" },
  RTV:       { bg: "bg-amber-500/15",   text: "text-amber-600" },
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? { bg: "bg-muted", text: "text-muted-foreground" };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold", style.bg, style.text)}>
      {status.replace("_", " ")}
    </span>
  );
}

/* ─── Page ─── */
export default function SerialLookupPage() {
  const { token, locationId } = useAuth();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["serial-lookup", debouncedSearch],
    queryFn: () =>
      apiFetch<{ data: SerialResult[] }>(
        `/inventory/serials?search=${encodeURIComponent(debouncedSearch)}`,
        { token, locationId },
      ),
    enabled: !!token && debouncedSearch.length >= 2,
    staleTime: 30_000,
  });

  const results = data?.data ?? [];
  const showResults = debouncedSearch.length >= 2;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/inventory"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Serial Number Lookup</h1>
          <p className="text-[12px] text-muted-foreground">
            Search by serial number to find item status, location, and history.
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Enter serial number..."
          autoFocus
          className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-4 text-sm placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {isFetching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}
      </div>

      {/* Results */}
      {!showResults && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Package size={40} className="mb-3 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            Type at least 2 characters to search serial numbers
          </p>
        </div>
      )}

      {showResults && !isLoading && results.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Search size={40} className="mb-3 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            No serial numbers found matching &ldquo;{debouncedSearch}&rdquo;
          </p>
        </div>
      )}

      {showResults && results.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Serial Number
                  </th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Product
                  </th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Status
                  </th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Location
                  </th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Received
                  </th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Sold
                  </th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Customer
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {results.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-muted/20">
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs font-medium">
                      {r.serialNumber}
                    </td>
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/inventory/${r.productId}/edit`}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        {r.productName}
                      </Link>
                      {r.sku && (
                        <span className="ml-1.5 text-[11px] text-muted-foreground">
                          {r.sku}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">
                      {r.locationName ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">
                      {r.receivedAt
                        ? new Date(r.receivedAt).toLocaleDateString()
                        : "—"}
                      {r.receivedSource && (
                        <span className="ml-1 text-[10px]">({r.receivedSource})</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">
                      {r.saleId && r.saleNumber ? (
                        <Link
                          href={`/sales/receipts/${r.saleId}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {r.saleNumber}
                        </Link>
                      ) : r.soldAt ? (
                        new Date(r.soldAt).toLocaleDateString()
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">
                      {r.customerName ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
