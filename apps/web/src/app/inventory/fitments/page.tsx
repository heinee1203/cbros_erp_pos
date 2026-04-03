"use client";

import { useState, useMemo } from "react";
import { Car, Search, Plus, Check, Loader2 } from "lucide-react";
import { useAuth } from "@/app/auth-context";
import { useVehicleMakes, useVehicleModels } from "@/hooks/use-vehicles";
import { mergeVehicleMakes } from "@/lib/vehicle-makes";
import {
  useVehiclesList,
  useVehicleProducts,
  useCreateVehicle,
  useBulkApplyFitment,
  useBulkRemoveFitment,
  useDeleteVehicle,
  useUnfitAllProducts,
  type Vehicle,
  type VehicleProduct,
} from "@/hooks/use-vehicle-manager";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

interface SearchProduct {
  id: string;
  name: string;
  sku: string;
  category?: string;
}

export default function FitmentManagerPage() {
  const { token, locationId, loading: authLoading } = useAuth();
  const { data: dbMakesData } = useVehicleMakes(token ?? "", locationId ?? "");
  const allMakes = useMemo(() => mergeVehicleMakes(dbMakesData?.data ?? []), [dbMakesData]);

  // Vehicle selector state
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [engine, setEngine] = useState("");

  // Existing vehicles
  const { data: vehiclesData } = useVehiclesList(token, locationId);
  const existingVehicles = vehiclesData?.data ?? [];
  const { data: modelsData } = useVehicleModels(token ?? "", locationId ?? "", make);
  const modelsList = modelsData?.data ?? [];

  // Vehicle products
  const { data: vehicleProdsData, isLoading: loadingProds } = useVehicleProducts(token, locationId, selectedVehicleId);
  const fittedProducts = vehicleProdsData?.data ?? [];
  const fittedProductIds = useMemo(() => new Set(fittedProducts.map(p => p.productId)), [fittedProducts]);

  // Product search
  const [productSearch, setProductSearch] = useState("");
  const [searchResults, setSearchResults] = useState<SearchProduct[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());

  // Mutations
  const createVehicleMut = useCreateVehicle(token, locationId);
  const bulkApplyMut = useBulkApplyFitment(token, locationId);
  const bulkRemoveMut = useBulkRemoveFitment(token, locationId);
  const deleteVehicleMut = useDeleteVehicle(token, locationId);
  const unfitAllMut = useUnfitAllProducts(token, locationId);

  const handleSearchProducts = async () => {
    if (!productSearch.trim() || !token || !locationId) return;
    setSearchLoading(true);
    try {
      const res = await apiFetch<{ data: SearchProduct[] }>(
        `/products?search=${encodeURIComponent(productSearch)}&limit=50&parentOnly=false`,
        { token, locationId },
      );
      setSearchResults(res.data ?? []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSelectExisting = (v: Vehicle) => {
    setSelectedVehicleId(v.id);
    setMake(v.make);
    setModel(v.model);
    setYearFrom(v.yearFrom ? String(v.yearFrom) : "");
    setYearTo(v.yearTo ? String(v.yearTo) : "");
    setEngine(v.engine || "");
    setSelectedProductIds(new Set());
  };

  const handleCreateOrSelect = async () => {
    if (!make || !model) return;
    const vehicle = await createVehicleMut.mutateAsync({
      make, model,
      yearFrom: yearFrom ? parseInt(yearFrom) : null,
      yearTo: yearTo ? parseInt(yearTo) : null,
      engine: engine || null,
    });
    if (vehicle) setSelectedVehicleId(vehicle.id);
  };

  const toggleProduct = (id: string) => {
    setSelectedProductIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const newSelections = useMemo(() => {
    return [...selectedProductIds].filter(id => !fittedProductIds.has(id));
  }, [selectedProductIds, fittedProductIds]);

  const handleApply = async () => {
    if (!selectedVehicleId || newSelections.length === 0) return;
    await bulkApplyMut.mutateAsync({ vehicleId: selectedVehicleId, productIds: newSelections });
    setSelectedProductIds(new Set());
  };

  const fieldClass = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

  if (authLoading) {
    return <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center gap-3 px-1">
        <Car className="h-5 w-5 text-muted-foreground" />
        <div>
          <h2 className="text-lg font-semibold">Fitment Manager</h2>
          <p className="text-sm text-muted-foreground">Bulk apply vehicle fitment to multiple products</p>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-[350px_1fr] gap-4 overflow-hidden">
        {/* ── Left: Vehicle Selector ── */}
        <div className="space-y-4 overflow-y-auto rounded-lg border border-border p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Vehicle</h3>

          {/* Existing vehicles dropdown */}
          {existingVehicles.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Select Existing</label>
              <select
                value={selectedVehicleId || ""}
                onChange={(e) => {
                  const v = existingVehicles.find(v => v.id === e.target.value);
                  if (v) handleSelectExisting(v);
                }}
                className={fieldClass}
              >
                <option value="">Choose a vehicle…</option>
                {existingVehicles.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.make} {v.model} {v.yearFrom ? `${v.yearFrom}-${v.yearTo || ""}` : ""} {v.engine || ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="border-t border-border pt-3">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Or Create New</label>
            <div className="space-y-2">
              <div>
                <label className="text-[10px] text-muted-foreground">Make *</label>
                <select value={make} onChange={(e) => { setMake(e.target.value); setModel(""); }} className={fieldClass}>
                  <option value="">Select make…</option>
                  {allMakes.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Model *</label>
                <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g., Montero Sport" list="models-list" className={fieldClass} />
                <datalist id="models-list">
                  {modelsList.map(m => <option key={m} value={m} />)}
                </datalist>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground">Year From</label>
                  <input type="number" value={yearFrom} onChange={(e) => setYearFrom(e.target.value)} placeholder="2016" className={fieldClass} />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Year To</label>
                  <input type="number" value={yearTo} onChange={(e) => setYearTo(e.target.value)} placeholder="2024" className={fieldClass} />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Engine</label>
                <input value={engine} onChange={(e) => setEngine(e.target.value)} placeholder="e.g., 2.4D" className={fieldClass} />
              </div>
              <button
                onClick={handleCreateOrSelect}
                disabled={!make || !model || createVehicleMut.isPending}
                className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {createVehicleMut.isPending ? "Creating…" : "Select / Create Vehicle"}
              </button>
            </div>
          </div>

          {/* Selected vehicle info */}
          {selectedVehicleId && (
            <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                <Car className="h-4 w-4" />
                {make} {model}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {yearFrom && `${yearFrom}-${yearTo || "present"}`} {engine}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Applied to: <span className="font-medium text-foreground">{fittedProducts.length}</span> products
              </div>
              <div className="mt-2 flex gap-2">
                {fittedProducts.length > 0 && (
                  <button
                    onClick={() => {
                      if (confirm(`Remove fitment from all ${fittedProducts.length} products for ${make} ${model}?`)) {
                        unfitAllMut.mutateAsync(selectedVehicleId);
                      }
                    }}
                    disabled={unfitAllMut.isPending}
                    className="rounded border border-warning/50 px-2 py-1 text-[11px] font-medium text-warning hover:bg-warning/10 disabled:opacity-50"
                  >
                    {unfitAllMut.isPending ? "Removing…" : "Unfit All"}
                  </button>
                )}
                <button
                  onClick={() => {
                    const msg = fittedProducts.length > 0
                      ? `Delete ${make} ${model} and remove all ${fittedProducts.length} fitment records?`
                      : `Delete ${make} ${model}?`;
                    if (confirm(msg)) {
                      deleteVehicleMut.mutateAsync({ id: selectedVehicleId, force: fittedProducts.length > 0 }).then(() => {
                        setSelectedVehicleId(null);
                        setMake(""); setModel(""); setYearFrom(""); setYearTo(""); setEngine("");
                      });
                    }
                  }}
                  disabled={deleteVehicleMut.isPending}
                  className="rounded border border-destructive/50 px-2 py-1 text-[11px] font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                >
                  {deleteVehicleMut.isPending ? "Deleting…" : "Delete Vehicle"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Right: Product Selector ── */}
        <div className="flex flex-col overflow-hidden rounded-lg border border-border">
          <div className="border-b border-border p-3">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Products</h3>
            <form onSubmit={(e) => { e.preventDefault(); handleSearchProducts(); }} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Search products by name, SKU…"
                  className="w-full rounded-lg border border-border bg-background py-2 pl-10 pr-4 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
                />
              </div>
              <button type="submit" disabled={searchLoading} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {searchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
              </button>
            </form>
          </div>

          <div className="flex-1 overflow-y-auto">
            {searchResults.length === 0 && !searchLoading ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Search className="mb-2 h-8 w-8 text-muted-foreground/20" />
                <p className="text-sm text-muted-foreground">Search for products to apply fitment</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {/* Select All header */}
                {searchResults.length > 0 && (() => {
                  const selectableIds = searchResults.filter(p => !fittedProductIds.has(p.id)).map(p => p.id);
                  const allChecked = selectableIds.length > 0 && selectableIds.every(id => selectedProductIds.has(id));
                  return (
                    <div className="flex items-center justify-between bg-muted/20 px-4 py-2 text-xs">
                      <label className="flex items-center gap-2 cursor-pointer font-medium">
                        <input
                          type="checkbox"
                          checked={allChecked}
                          onChange={() => {
                            if (allChecked) {
                              setSelectedProductIds(prev => {
                                const next = new Set(prev);
                                selectableIds.forEach(id => next.delete(id));
                                return next;
                              });
                            } else {
                              setSelectedProductIds(prev => {
                                const next = new Set(prev);
                                selectableIds.forEach(id => next.add(id));
                                return next;
                              });
                            }
                          }}
                          className="rounded"
                          disabled={selectableIds.length === 0}
                        />
                        Select All ({searchResults.length} results)
                      </label>
                      <span className="text-muted-foreground">
                        {selectedProductIds.size > 0 ? `${selectedProductIds.size} selected` : ""}
                      </span>
                    </div>
                  );
                })()}
                {searchResults.map(p => {
                  const isFitted = fittedProductIds.has(p.id);
                  const isSelected = selectedProductIds.has(p.id);
                  return (
                    <label
                      key={p.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/30",
                        (isFitted || isSelected) && "bg-primary/5",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isFitted || isSelected}
                        onChange={() => toggleProduct(p.id)}
                        className="rounded"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{p.name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{p.sku}</div>
                      </div>
                      {isFitted && (
                        <span className="flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
                          <Check className="h-3 w-3" /> Fitted
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Apply button */}
          {selectedVehicleId && newSelections.length > 0 && (
            <div className="border-t border-border bg-muted/30 px-4 py-3">
              <button
                onClick={handleApply}
                disabled={bulkApplyMut.isPending}
                className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {bulkApplyMut.isPending
                  ? "Applying…"
                  : `Apply Fitment to ${newSelections.length} Product${newSelections.length !== 1 ? "s" : ""}`}
              </button>
            </div>
          )}
          {!selectedVehicleId && searchResults.length > 0 && (
            <div className="border-t border-border bg-warning/5 px-4 py-3 text-center text-xs text-warning">
              Select or create a vehicle first
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
