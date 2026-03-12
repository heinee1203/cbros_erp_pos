"use client";

import { useState, useMemo } from "react";
import { Search, X, Package, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/app/auth-context";
import { useSuppliers } from "@/hooks/use-suppliers";

export default function SuppliersPage() {
  const { token, locationId } = useAuth();
  const suppliersQuery = useSuppliers(token, locationId);
  const [search, setSearch] = useState("");

  const suppliers = suppliersQuery.data?.data ?? [];

  const filtered = useMemo(() => {
    if (!search.trim()) return suppliers;
    const q = search.toLowerCase();
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.contactEmail?.toLowerCase().includes(q) ?? false) ||
        (s.contactPhone?.toLowerCase().includes(q) ?? false) ||
        (s.address?.toLowerCase().includes(q) ?? false)
    );
  }, [suppliers, search]);

  if (suppliersQuery.isLoading) {
    return (
      <div className="flex h-full flex-col">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Suppliers</h2>
          <p className="text-sm text-muted-foreground">
            Vendor directory for procurement and purchase orders
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
          <h2 className="text-lg font-semibold">Suppliers</h2>
          <p className="text-sm text-muted-foreground">
            Vendor directory for procurement and purchase orders
          </p>
        </div>
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
          placeholder="Search by name, email, or phone\u2026"
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
                Supplier
              </th>
              <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Email
              </th>
              <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Phone
              </th>
              <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Address
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-12 text-center">
                  <div className="flex flex-col items-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                      <Package size={16} className="text-muted-foreground" />
                    </div>
                    <p className="mt-3 text-sm font-medium text-foreground">
                      No suppliers found
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {search ? "Try adjusting your search" : "No suppliers have been added yet"}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((s, i) => (
                <tr
                  key={s.id}
                  className={cn(
                    "border-b border-border transition-colors hover:bg-accent",
                    i % 2 === 0 ? "bg-background" : "bg-muted/20"
                  )}
                >
                  <td className="px-3 py-2 text-sm font-medium">{s.name}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {s.contactEmail ?? "\u2014"}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {s.contactPhone ?? "\u2014"}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {s.address ?? "\u2014"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-2">
          <span className="text-xs text-muted-foreground">
            {filtered.length} supplier{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
