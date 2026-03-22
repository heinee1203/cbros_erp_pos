"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ShieldCheck, ShieldX, ShieldAlert, FileText } from "lucide-react";
import { useAuth } from "@/app/auth-context";
import { useWarrantyLookup, type WarrantyRecord } from "@/hooks/use-warranties";

export default function WarrantyLookupPage() {
  const { token, locationId, loading: authLoading } = useAuth();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState<"serial" | "receiptNumber" | "customerId">("serial");
  const [submitted, setSubmitted] = useState("");

  const { data, isLoading } = useWarrantyLookup(token, locationId, submitted, searchType);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) setSubmitted(query.trim());
  };

  if (authLoading) {
    return <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Warranty Lookup</h2>
        <p className="text-sm text-muted-foreground">Search by serial number, receipt number, or customer</p>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearch} className="mb-4 flex gap-2">
        <select
          value={searchType}
          onChange={(e) => setSearchType(e.target.value as any)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
        >
          <option value="serial">Serial Number</option>
          <option value="receiptNumber">Receipt #</option>
          <option value="customerId">Customer ID</option>
        </select>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchType === "serial" ? "Enter serial number…" : searchType === "receiptNumber" ? "Enter receipt number…" : "Enter customer ID…"}
            className="w-full rounded-lg border border-border bg-background py-2 pl-10 pr-4 text-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/20"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Search
        </button>
      </form>

      {/* Results */}
      {isLoading && submitted && (
        <div className="py-8 text-center text-sm text-muted-foreground">Searching…</div>
      )}

      {data && !isLoading && (
        <div className="space-y-3">
          {data.records.length === 0 ? (
            <div className="rounded-lg border border-border bg-muted/30 px-6 py-8 text-center">
              <ShieldAlert className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">{data.message}</p>
            </div>
          ) : (
            data.records.map((r: WarrantyRecord) => (
              <WarrantyCard key={r.id} record={r} onFileClaim={() => router.push(`/warranties/claims?warrantyRecordId=${r.id}`)} />
            ))
          )}
        </div>
      )}

      {!submitted && !isLoading && (
        <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
          <ShieldCheck className="mb-3 h-12 w-12 text-muted-foreground/20" />
          <p className="text-sm text-muted-foreground">Enter a serial number, receipt number, or customer ID to check warranty status</p>
        </div>
      )}
    </div>
  );
}

// ── Warranty Card ──

function WarrantyCard({ record: r, onFileClaim }: { record: WarrantyRecord; onFileClaim: () => void }) {
  const isValid = r.isUnderWarranty === true;
  const isClaimed = r.status === "CLAIMED";
  const isVoided = r.status === "VOIDED";

  return (
    <div className={`rounded-lg border-2 p-5 ${
      isValid ? "border-success/50 bg-success/5" :
      isClaimed ? "border-warning/50 bg-warning/5" :
      isVoided ? "border-muted bg-muted/20" :
      "border-destructive/50 bg-destructive/5"
    }`}>
      {/* Status banner */}
      <div className={`mb-3 flex items-center gap-2 text-sm font-semibold ${
        isValid ? "text-success" :
        isClaimed ? "text-warning" :
        isVoided ? "text-muted-foreground" :
        "text-destructive"
      }`}>
        {isValid ? <ShieldCheck className="h-5 w-5" /> :
         isClaimed ? <FileText className="h-5 w-5" /> :
         <ShieldX className="h-5 w-5" />}
        {r.message}
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <div>
          <span className="text-muted-foreground">Product: </span>
          <span className="font-medium">{r.productName}</span>
        </div>
        {r.serialNumber && (
          <div>
            <span className="text-muted-foreground">Serial: </span>
            <span className="font-mono font-medium">{r.serialNumber}</span>
          </div>
        )}
        {r.customerName && (
          <div>
            <span className="text-muted-foreground">Customer: </span>
            <span className="font-medium">{r.customerName}</span>
          </div>
        )}
        <div>
          <span className="text-muted-foreground">Purchased: </span>
          <span>{new Date(r.purchaseDate).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Expires: </span>
          <span>{new Date(r.expiryDate).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}</span>
        </div>
        {r.daysRemaining !== undefined && (
          <div>
            <span className="text-muted-foreground">Days Remaining: </span>
            <span className={`font-semibold ${r.daysRemaining > 30 ? "text-success" : r.daysRemaining > 0 ? "text-warning" : "text-destructive"}`}>
              {r.daysRemaining > 0 ? r.daysRemaining : 0}
            </span>
          </div>
        )}
      </div>

      {/* Coverage */}
      {r.coverageDescription && (
        <div className="mt-3 border-t border-border/50 pt-2 text-sm">
          <div className="text-muted-foreground">Coverage: <span className="text-foreground">{r.coverageDescription}</span></div>
        </div>
      )}
      {r.exclusions && (
        <div className="mt-1 text-sm">
          <div className="text-muted-foreground">Excludes: <span className="text-foreground">{r.exclusions}</span></div>
        </div>
      )}

      {/* Actions */}
      {isValid && (
        <div className="mt-3 border-t border-border/50 pt-3">
          <button
            onClick={onFileClaim}
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            File Warranty Claim
          </button>
        </div>
      )}
    </div>
  );
}
