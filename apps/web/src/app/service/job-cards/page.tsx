"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, X, Wrench, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/format";
import { useAuth } from "@/app/auth-context";
import { useJobCardsList } from "@/hooks/use-job-cards-list";

const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: "bg-muted text-muted-foreground",
  CHECKED_IN: "bg-blue-100 text-blue-700",
  ESTIMATING: "bg-violet-100 text-violet-700",
  APPROVED: "bg-primary/10 text-primary",
  WAITING_FOR_PARTS: "bg-warning/10 text-warning",
  READY_FOR_BAY: "bg-cyan-100 text-cyan-700",
  IN_PROGRESS: "bg-orange-100 text-orange-700",
  WORK_COMPLETED: "bg-success/10 text-success",
  INVOICED: "bg-emerald-100 text-emerald-700",
  CLOSED: "bg-muted text-muted-foreground",
  CANCELLED: "bg-destructive/10 text-destructive",
};

export default function JobCardsPage() {
  const { token, locationId } = useAuth();
  const jobCardsQuery = useJobCardsList(token, locationId);
  const [search, setSearch] = useState("");

  const jobCards = jobCardsQuery.data?.data ?? [];

  const filtered = useMemo(() => {
    if (!search.trim()) return jobCards;
    const q = search.toLowerCase();
    return jobCards.filter(
      (jc) =>
        jc.jobNo.toLowerCase().includes(q) ||
        jc.customerName.toLowerCase().includes(q)
    );
  }, [jobCards, search]);

  if (jobCardsQuery.isLoading) {
    return (
      <div className="flex h-full flex-col">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Job Cards</h2>
          <p className="text-sm text-muted-foreground">
            Service jobs, estimates, parts issuance, and invoicing
          </p>
        </div>
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Job Cards</h2>
          <p className="text-sm text-muted-foreground">
            Service jobs, estimates, parts issuance, and invoicing
          </p>
        </div>
        <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          + New Job Card
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by job number or customer…"
          className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-8 text-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/20"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Job No.
              </th>
              <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Customer
              </th>
              <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Status
              </th>
              <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Created
              </th>
              <th scope="col" className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center">
                  <div className="flex flex-col items-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                      <Wrench size={16} className="text-muted-foreground" />
                    </div>
                    <p className="mt-3 text-sm font-medium text-foreground">
                      No job cards found
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {search ? "Try adjusting your search" : "No job cards have been created yet"}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((jc, i) => (
                <tr
                  key={jc.id}
                  className={cn(
                    "border-b border-border transition-colors hover:bg-accent",
                    i % 2 === 0 ? "bg-background" : "bg-muted/20"
                  )}
                >
                  <td className="px-3 py-2 font-mono text-sm font-semibold">
                    {jc.jobNo}
                  </td>
                  <td className="px-3 py-2 text-sm">{jc.customerName}</td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold",
                        STATUS_COLORS[jc.status] ?? "bg-muted text-muted-foreground"
                      )}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      {jc.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {fmtDate(jc.createdAt)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/service/job-cards/${jc.jobNo}`}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-2">
          <span className="text-xs text-muted-foreground">
            {filtered.length} job card{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
