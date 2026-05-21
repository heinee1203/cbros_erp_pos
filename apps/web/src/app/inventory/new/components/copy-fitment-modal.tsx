"use client";

import { useEffect, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { VehicleEntry } from "../types";

type CopyFitmentModalProps = {
  open: boolean;
  onClose: () => void;
  onCopy: (entries: VehicleEntry[]) => void;
  token: string;
  locationId: string;
  excludeProductId?: string;
};

export function CopyFitmentModal({
  open,
  onClose,
  onCopy,
  token,
  locationId,
  excludeProductId,
}: CopyFitmentModalProps) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (open) {
      setSearch("");
      setDebouncedSearch("");
      setSelectedProduct(null);
    }
  }, [open]);

  const { data: searchResults, isLoading: searching } = useQuery<{ data: any[] }>({
    queryKey: ["copy-fitment-search", debouncedSearch],
    queryFn: () =>
      apiFetch<{ data: any[] }>(
        `/products?search=${encodeURIComponent(debouncedSearch)}&limit=10&hasVehicles=true`,
        {
          token,
          locationId,
        },
      ),
    enabled: open && !!debouncedSearch && debouncedSearch.length >= 2,
    staleTime: 15_000,
  });

  const { data: vehicleData, isLoading: loadingVehicles } = useQuery<{
    data: any[];
  }>({
    queryKey: ["copy-fitment-vehicles", selectedProduct?.id],
    queryFn: () =>
      apiFetch<{ data: any[] }>(`/products/${selectedProduct.id}/vehicles`, {
        token,
        locationId,
      }),
    enabled: !!selectedProduct?.id,
  });

  const handleCopy = () => {
    if (!vehicleData?.data) return;
    const entries: VehicleEntry[] = vehicleData.data.map((vehicle: any) => ({
      id: crypto.randomUUID(),
      make: vehicle.make,
      model: vehicle.model,
      yearStart: vehicle.yearStart != null ? String(vehicle.yearStart) : "",
      yearEnd: vehicle.yearEnd != null ? String(vehicle.yearEnd) : "",
      engine: vehicle.engine || "",
      notes: vehicle.notes || "",
    }));
    onCopy(entries);
    onClose();
  };

  const filteredResults = (searchResults?.data ?? []).filter(
    (product: any) => product.id !== excludeProductId,
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-xl border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold">
            Copy Vehicle Fitment from Another Item
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={16} />
          </button>
        </div>

        <div className="border-b border-border px-5 py-3">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setSelectedProduct(null);
              }}
              placeholder="Search by item name or SKU..."
              className="w-full rounded-lg border border-border bg-muted/30 py-2 pl-9 pr-3 text-sm"
              autoFocus
            />
          </div>
        </div>

        <div className="max-h-[300px] overflow-y-auto px-5 py-3">
          {searching && (
            <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
              <Loader2 size={14} className="mr-2 animate-spin" /> Searching...
            </div>
          )}
          {!searching && debouncedSearch.length >= 2 && filteredResults.length === 0 && (
            <div className="py-6 text-center text-xs text-muted-foreground">
              No products with vehicle fitments found
            </div>
          )}
          {filteredResults.map((product: any) => (
            <button
              key={product.id}
              onClick={() => setSelectedProduct(product)}
              className={cn(
                "flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left hover:bg-accent",
                selectedProduct?.id === product.id && "bg-accent ring-1 ring-primary",
              )}
            >
              <div>
                <div className="text-sm font-medium">{product.name}</div>
                <div className="text-xs text-muted-foreground">{product.sku}</div>
              </div>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {product.vehicleCount} fitment{product.vehicleCount !== 1 ? "s" : ""}
              </span>
            </button>
          ))}
        </div>

        {selectedProduct && (
          <div className="border-t border-border px-5 py-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Fitments to copy:
            </div>
            {loadingVehicles ? (
              <div className="flex items-center text-xs text-muted-foreground">
                <Loader2 size={12} className="mr-2 animate-spin" /> Loading...
              </div>
            ) : (
              <div className="space-y-1">
                {(vehicleData?.data ?? []).map((vehicle: any, index: number) => (
                  <div key={index} className="text-xs text-muted-foreground">
                    {vehicle.make} {vehicle.model}
                    {(vehicle.yearStart || vehicle.yearEnd) &&
                      ` ${vehicle.yearStart || "?"}â€“${vehicle.yearEnd || "?"}`}
                    {vehicle.engine ? ` (${vehicle.engine})` : ""}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleCopy}
            disabled={!vehicleData?.data?.length}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Copy {vehicleData?.data?.length ?? 0} Fitment
            {(vehicleData?.data?.length ?? 0) !== 1 ? "s" : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
