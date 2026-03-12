"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Package,
  DollarSign,
  Warehouse,
  MapPin,
  Layers,
  Car,
  Plus,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Check,
  Info,
} from "lucide-react";
import { useAuth } from "@/app/auth-context";
import { useCreateProduct, useProductFamilies } from "@/hooks/use-products";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────
 * Constants
 * ───────────────────────────────────────────── */

const CATEGORIES = [
  { value: "TIRES", label: "Tires" },
  { value: "LUBRICANTS", label: "Lubricants" },
  { value: "HARD_PARTS", label: "Hard Parts" },
  { value: "ACCESSORIES", label: "Accessories" },
  { value: "LABOR_SERVICES", label: "Labor / Services" },
];

const UNITS_OF_MEASURE = [
  "Each",
  "Pair",
  "Set",
  "Liter",
  "Gallon",
  "Box",
  "Case",
  "Meter",
  "Foot",
  "Kilogram",
];

const AUTO_MAKES = [
  "Acura", "Audi", "BMW", "Cadillac", "Chevrolet", "Chrysler", "Dodge",
  "Ford", "GMC", "Honda", "Hyundai", "Infiniti", "Jeep", "Kia",
  "Lexus", "Lincoln", "Mazda", "Mercedes-Benz", "Mitsubishi", "Nissan",
  "Ram", "Subaru", "Toyota", "Volkswagen", "Volvo",
];

/* ─────────────────────────────────────────────
 * Types
 * ───────────────────────────────────────────── */

interface VehicleEntry {
  id: string;
  make: string;
  model: string;
  yearStart: string;
  yearEnd: string;
  engine: string;
  notes: string;
}

interface AttributeEntry {
  id: string;
  name: string;
  values: string;
}

/* ─────────────────────────────────────────────
 * Page
 * ───────────────────────────────────────────── */

export default function AddItemPage() {
  const router = useRouter();
  const { token, locationId, user, locations } = useAuth();
  const createMutation = useCreateProduct(token, locationId);
  const familiesQuery = useProductFamilies(token, locationId);
  const families = familiesQuery.data?.data ?? [];

  const showCost = ["ADMIN", "MANAGER"].includes(user?.role ?? "");

  // Section collapse state
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const toggleSection = (id: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Section 1: Basic Info ──
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [mnemonicSku, setMnemonicSku] = useState("");
  const [category, setCategory] = useState("");
  const [familyId, setFamilyId] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);

  // ── Section 2: Pricing ──
  const [unitPrice, setUnitPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");

  // ── Section 3: Inventory Behavior ──
  const [trackInventory, setTrackInventory] = useState(true);
  const [unitOfMeasure, setUnitOfMeasure] = useState("Each");
  const [reorderPoint, setReorderPoint] = useState("10");
  const [leadTimeDays, setLeadTimeDays] = useState("7");
  const [barcode, setBarcode] = useState("");
  const [initialStock, setInitialStock] = useState("0");

  // ── Section 4: Location Availability ──
  const [selectedLocations, setSelectedLocations] = useState<Set<string>>(new Set([locationId]));

  // ── Section 5: Attributes / Variants ──
  const [attributes, setAttributes] = useState<AttributeEntry[]>([]);

  // ── Section 6: Vehicle Compatibility ──
  const [vehicles, setVehicles] = useState<VehicleEntry[]>([]);

  // ── Validation & Error ──
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // ── Unsaved changes warning ──
  const isDirty = !!(name || sku || category || unitPrice || costPrice || description || barcode);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // Auto-generate mnemonic SKU from name
  const generateMnemonic = (n: string): string => {
    const clean = n.toUpperCase().replace(/[^A-Z]/g, "");
    const base = clean.slice(0, 10);
    if (base.length >= 10) return base;
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let result = base;
    while (result.length < 10) result += chars[Math.floor(Math.random() * 26)];
    return result;
  };

  const margin = useMemo(() => {
    const sell = parseFloat(unitPrice) || 0;
    const cost = parseFloat(costPrice) || 0;
    if (sell <= 0) return null;
    return ((sell - cost) / sell * 100).toFixed(1);
  }, [unitPrice, costPrice]);

  const isValid =
    name.trim() !== "" &&
    sku.trim() !== "" &&
    category !== "";

  const handleSave = async (addAnother = false) => {
    if (!isValid) return;
    setError(null);
    setSuccessMessage(null);

    const mnemonic = mnemonicSku.length === 10 && /^[A-Z]{10}$/.test(mnemonicSku)
      ? mnemonicSku
      : generateMnemonic(name);

    try {
      await createMutation.mutateAsync({
        name: name.trim(),
        sku: sku.trim(),
        mnemonicSku: mnemonic,
        category,
        unitPrice: unitPrice || "0.00",
        costPrice: showCost ? (costPrice || "0.00") : "0.00",
        barcode: barcode.trim() || undefined,
        familyId: familyId || null,
        description: description || undefined,
        trackInventory,
        reorderPoint: parseInt(reorderPoint, 10) || 10,
        leadTimeDays: parseInt(leadTimeDays, 10) || 7,
        initialStock: trackInventory ? parseInt(initialStock, 10) || 0 : 0,
        locationIds: Array.from(selectedLocations),
        vehicleCompatibility:
          vehicles.length > 0
            ? vehicles
                .filter((v) => v.make && v.model && v.yearStart && v.yearEnd)
                .map((v) => ({
                  make: v.make,
                  model: v.model,
                  yearStart: parseInt(v.yearStart, 10),
                  yearEnd: parseInt(v.yearEnd, 10),
                  engine: v.engine || undefined,
                  notes: v.notes || undefined,
                }))
            : undefined,
      });

      if (addAnother) {
        setSuccessMessage(`"${name}" created successfully`);
        setName("");
        setSku("");
        setMnemonicSku("");
        setUnitPrice("");
        setCostPrice("");
        setDescription("");
        setInitialStock("0");
        setVehicles([]);
        setAttributes([]);
      } else {
        router.push("/inventory");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to create product");
    }
  };

  // ── Vehicle helpers ──
  const addVehicle = () => {
    setVehicles((prev) => [
      ...prev,
      { id: crypto.randomUUID(), make: "", model: "", yearStart: "", yearEnd: "", engine: "", notes: "" },
    ]);
  };
  const updateVehicle = (id: string, field: keyof VehicleEntry, value: string) => {
    setVehicles((prev) => prev.map((v) => (v.id === id ? { ...v, [field]: value } : v)));
  };
  const removeVehicle = (id: string) => {
    setVehicles((prev) => prev.filter((v) => v.id !== id));
  };

  // ── Attribute helpers ──
  const addAttribute = () => {
    setAttributes((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: "", values: "" },
    ]);
  };
  const updateAttribute = (id: string, field: keyof AttributeEntry, value: string) => {
    setAttributes((prev) => prev.map((a) => (a.id === id ? { ...a, [field]: value } : a)));
  };
  const removeAttribute = (id: string) => {
    setAttributes((prev) => prev.filter((a) => a.id !== id));
  };

  // Variant preview
  const variantCombinations = useMemo(() => {
    const validAttrs = attributes.filter(
      (a) => a.name.trim() && a.values.trim(),
    );
    if (validAttrs.length === 0) return [];
    const valueSets = validAttrs.map((a) =>
      a.values.split(",").map((v) => v.trim()).filter(Boolean),
    );
    // Cartesian product
    const combine = (sets: string[][]): string[][] => {
      if (sets.length === 0) return [[]];
      const [first, ...rest] = sets;
      const subCombinations = combine(rest);
      return first.flatMap((val) => subCombinations.map((sub) => [val, ...sub]));
    };
    return combine(valueSets).slice(0, 20); // Limit preview to 20
  }, [attributes]);

  return (
    <div className="flex h-full flex-col">
      {/* ── Page Header ── */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/inventory")}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Add New Item</h2>
            <p className="text-[12px] text-muted-foreground">
              Full item setup — catalog, pricing, inventory, and compatibility
            </p>
          </div>
        </div>
      </div>

      {/* ── Status Messages ── */}
      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          <AlertCircle size={14} />
          {error}
        </div>
      )}
      {successMessage && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-success/20 bg-success/5 px-3 py-2 text-[12px] text-success">
          <Check size={14} />
          {successMessage}
        </div>
      )}

      {/* ── Sections ── */}
      <div className="flex-1 overflow-y-auto pb-20 space-y-3">

        {/* ══════════════════════════════════════════
         *  SECTION 1 — Basic Info
         * ══════════════════════════════════════════ */}
        <FormSection
          id="basic"
          icon={Package}
          title="Basic Information"
          collapsed={collapsedSections.has("basic")}
          onToggle={() => toggleSection("basic")}
        >
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            {/* Name — full width */}
            <div className="col-span-2">
              <FieldLabel required>Item Name</FieldLabel>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. ACDelco Brake Pad - Honda Civic 2016-2021"
                autoFocus
                className={fieldClass}
              />
            </div>

            {/* SKU */}
            <div>
              <FieldLabel required>SKU</FieldLabel>
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value.toUpperCase())}
                placeholder="e.g. HAR-050001"
                className={cn(fieldClass, "font-mono")}
              />
            </div>

            {/* Mnemonic SKU */}
            <div>
              <FieldLabel>Mnemonic Code</FieldLabel>
              <input
                type="text"
                value={mnemonicSku}
                onChange={(e) => setMnemonicSku(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 10))}
                placeholder="Auto-generated"
                maxLength={10}
                className={cn(fieldClass, "font-mono tracking-wider")}
              />
              <p className="mt-0.5 text-[10px] text-muted-foreground">10 uppercase letters · auto-generated if blank</p>
            </div>

            {/* Category */}
            <div>
              <FieldLabel required>Category</FieldLabel>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={fieldClass}>
                <option value="">Select category…</option>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            {/* Family */}
            <div>
              <FieldLabel>Family</FieldLabel>
              <select value={familyId} onChange={(e) => setFamilyId(e.target.value)} className={fieldClass}>
                <option value="">No family (standalone)</option>
                {families.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>

            {/* Description — full width */}
            <div className="col-span-2">
              <FieldLabel>Description / Notes</FieldLabel>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Internal notes, fitment details, handling instructions…"
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
              />
            </div>

            {/* Active Status */}
            <div className="col-span-2 flex items-center gap-2">
              <ToggleSwitch checked={isActive} onChange={setIsActive} />
              <span className="text-[13px] text-foreground">Active in catalog</span>
            </div>
          </div>
        </FormSection>

        {/* ══════════════════════════════════════════
         *  SECTION 2 — Pricing
         * ══════════════════════════════════════════ */}
        <FormSection
          id="pricing"
          icon={DollarSign}
          title="Pricing"
          collapsed={collapsedSections.has("pricing")}
          onToggle={() => toggleSection("pricing")}
        >
          <div className={cn("grid gap-x-4 gap-y-3", showCost ? "grid-cols-3" : "grid-cols-1")}>
            <div>
              <FieldLabel>Sell Price</FieldLabel>
              <CurrencyInput value={unitPrice} onChange={setUnitPrice} />
            </div>
            {showCost && (
              <>
                <div>
                  <FieldLabel>Cost Price</FieldLabel>
                  <CurrencyInput value={costPrice} onChange={setCostPrice} />
                </div>
                <div>
                  <FieldLabel>Margin</FieldLabel>
                  <div className="flex h-9 items-center rounded-lg border border-border bg-muted/40 px-3 text-[13px]">
                    {margin !== null ? (
                      <span className={cn(
                        "font-medium",
                        parseFloat(margin) > 30 ? "text-success" : parseFloat(margin) > 0 ? "text-warning" : "text-destructive",
                      )}>
                        {margin}%
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </FormSection>

        {/* ══════════════════════════════════════════
         *  SECTION 3 — Inventory Behavior
         * ══════════════════════════════════════════ */}
        <FormSection
          id="inventory"
          icon={Warehouse}
          title="Inventory Behavior"
          collapsed={collapsedSections.has("inventory")}
          onToggle={() => toggleSection("inventory")}
        >
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <ToggleSwitch checked={trackInventory} onChange={setTrackInventory} />
              <span className="text-[13px] text-foreground">Track inventory for this item</span>
            </div>

            {trackInventory && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-4">
                <div>
                  <FieldLabel>Unit of Measure</FieldLabel>
                  <select value={unitOfMeasure} onChange={(e) => setUnitOfMeasure(e.target.value)} className={fieldClass}>
                    {UNITS_OF_MEASURE.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <FieldLabel>Reorder Point</FieldLabel>
                  <input type="number" min="0" value={reorderPoint} onChange={(e) => setReorderPoint(e.target.value)} className={fieldClass} />
                </div>
                <div>
                  <FieldLabel>Lead Time (Days)</FieldLabel>
                  <input type="number" min="0" value={leadTimeDays} onChange={(e) => setLeadTimeDays(e.target.value)} className={fieldClass} />
                </div>
                <div>
                  <FieldLabel>Initial Stock</FieldLabel>
                  <input type="number" min="0" value={initialStock} onChange={(e) => setInitialStock(e.target.value)} className={fieldClass} />
                </div>
                <div className="col-span-2">
                  <FieldLabel>Barcode (EAN-13)</FieldLabel>
                  <input type="text" value={barcode} onChange={(e) => setBarcode(e.target.value.replace(/\D/g, "").slice(0, 13))} placeholder="Auto-generated if empty" maxLength={13} className={cn(fieldClass, "font-mono")} />
                  <p className="mt-0.5 text-[10px] text-muted-foreground">Leave blank to auto-generate a unique barcode</p>
                </div>
              </div>
            )}
          </div>
        </FormSection>

        {/* ══════════════════════════════════════════
         *  SECTION 4 — Location Availability
         * ══════════════════════════════════════════ */}
        <FormSection
          id="locations"
          icon={MapPin}
          title="Location Availability"
          collapsed={collapsedSections.has("locations")}
          onToggle={() => toggleSection("locations")}
          badge={`${selectedLocations.size} of ${locations.length}`}
        >
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th scope="col" className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Location</th>
                  <th scope="col" className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Type</th>
                  <th scope="col" className="px-3 py-2 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Available</th>
                </tr>
              </thead>
              <tbody>
                {locations.filter((l) => l.isActive).map((loc) => (
                  <tr key={loc.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 font-medium text-foreground">{loc.name}</td>
                    <td className="px-3 py-2 text-muted-foreground capitalize">{loc.type.toLowerCase().replace("_", " ")}</td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={selectedLocations.has(loc.id)}
                        onChange={() => {
                          setSelectedLocations((prev) => {
                            const next = new Set(prev);
                            if (next.has(loc.id)) next.delete(loc.id);
                            else next.add(loc.id);
                            return next;
                          });
                        }}
                        className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </FormSection>

        {/* ══════════════════════════════════════════
         *  SECTION 5 — Attributes / Variants
         * ══════════════════════════════════════════ */}
        <FormSection
          id="attributes"
          icon={Layers}
          title="Attributes / Variants"
          collapsed={collapsedSections.has("attributes")}
          onToggle={() => toggleSection("attributes")}
          badge={attributes.length > 0 ? `${attributes.length} attr` : undefined}
        >
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2 text-[12px] text-muted-foreground">
              <Info size={13} />
              <span>Define attributes (e.g. Pack Size, Viscosity, Tire Size) to generate variant SKUs. Variant SKUs will be created as separate products sharing a family.</span>
            </div>

            {attributes.map((attr) => (
              <div key={attr.id} className="flex items-start gap-2">
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={attr.name}
                    onChange={(e) => updateAttribute(attr.id, "name", e.target.value)}
                    placeholder="Attribute (e.g. Pack Size)"
                    className={fieldClass}
                  />
                  <input
                    type="text"
                    value={attr.values}
                    onChange={(e) => updateAttribute(attr.id, "values", e.target.value)}
                    placeholder="Values (comma-separated: 1L, 4L, 5L)"
                    className={fieldClass}
                  />
                </div>
                <button onClick={() => removeAttribute(attr.id)} className="mt-1.5 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}

            <button
              onClick={addAttribute}
              className="flex items-center gap-1.5 text-[12px] font-medium text-primary hover:text-primary/80"
            >
              <Plus size={13} />
              Add Attribute
            </button>

            {/* Variant Preview */}
            {variantCombinations.length > 0 && (
              <div className="mt-2 rounded-lg border border-border bg-muted/20 p-3">
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Variant Preview ({variantCombinations.length} combinations)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {variantCombinations.map((combo, i) => (
                    <span
                      key={i}
                      className="rounded-md bg-background border border-border px-2 py-0.5 text-[11px] font-medium text-foreground"
                    >
                      {combo.join(" / ")}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  These will be created as individual SKUs under the selected family when variant creation is enabled.
                </p>
              </div>
            )}
          </div>
        </FormSection>

        {/* ══════════════════════════════════════════
         *  SECTION 6 — Vehicle Compatibility
         * ══════════════════════════════════════════ */}
        <FormSection
          id="vehicles"
          icon={Car}
          title="Vehicle Compatibility"
          collapsed={collapsedSections.has("vehicles")}
          onToggle={() => toggleSection("vehicles")}
          badge={vehicles.length > 0 ? `${vehicles.length} entries` : undefined}
        >
          <div className="space-y-3">
            {category === "LABOR_SERVICES" || category === "ACCESSORIES" ? (
              <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2 text-[12px] text-muted-foreground">
                <Info size={13} />
                <span>Vehicle compatibility is typically used for Hard Parts and Tires. You can still add entries if needed.</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2 text-[12px] text-muted-foreground">
                <Info size={13} />
                <span>Specify which vehicles this part fits. This data is persisted and searchable.</span>
              </div>
            )}

            {vehicles.map((v) => (
              <div key={v.id} className="rounded-lg border border-border bg-muted/10 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Fitment Entry</span>
                  <button onClick={() => removeVehicle(v.id)} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                  <div>
                    <FieldLabel>Make</FieldLabel>
                    <select value={v.make} onChange={(e) => updateVehicle(v.id, "make", e.target.value)} className={fieldClass}>
                      <option value="">Select…</option>
                      {AUTO_MAKES.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <FieldLabel>Model</FieldLabel>
                    <input type="text" value={v.model} onChange={(e) => updateVehicle(v.id, "model", e.target.value)} placeholder="e.g. Civic" className={fieldClass} />
                  </div>
                  <div>
                    <FieldLabel>Year From</FieldLabel>
                    <input type="number" min="1990" max="2030" value={v.yearStart} onChange={(e) => updateVehicle(v.id, "yearStart", e.target.value)} placeholder="2016" className={fieldClass} />
                  </div>
                  <div>
                    <FieldLabel>Year To</FieldLabel>
                    <input type="number" min="1990" max="2030" value={v.yearEnd} onChange={(e) => updateVehicle(v.id, "yearEnd", e.target.value)} placeholder="2021" className={fieldClass} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <FieldLabel>Engine / Application</FieldLabel>
                    <input type="text" value={v.engine} onChange={(e) => updateVehicle(v.id, "engine", e.target.value)} placeholder="e.g. 1.5L Turbo" className={fieldClass} />
                  </div>
                  <div>
                    <FieldLabel>Fitment Notes</FieldLabel>
                    <input type="text" value={v.notes} onChange={(e) => updateVehicle(v.id, "notes", e.target.value)} placeholder="e.g. Front only, OEM replacement" className={fieldClass} />
                  </div>
                </div>
              </div>
            ))}

            <button
              onClick={addVehicle}
              className="flex items-center gap-1.5 text-[12px] font-medium text-primary hover:text-primary/80"
            >
              <Plus size={13} />
              Add Vehicle Fitment
            </button>
          </div>
        </FormSection>
      </div>

      {/* ── Sticky Action Bar ── */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-background/95 backdrop-blur-sm md:left-[252px]">
        <div className="flex items-center justify-between px-6 py-3">
          <button
            onClick={() => router.push("/inventory")}
            className="rounded-lg border border-border bg-background px-4 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-muted"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSave(true)}
              disabled={!isValid || createMutation.isPending}
              className="rounded-lg border border-border bg-background px-4 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save & Add Another
            </button>
            <button
              onClick={() => handleSave(false)}
              disabled={!isValid || createMutation.isPending}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-[13px] font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {createMutation.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Check size={14} />
              )}
              {createMutation.isPending ? "Saving…" : "Save Item"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Shared Sub-components
 * ───────────────────────────────────────────── */

const fieldClass =
  "h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]";

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="mb-1 block text-[12px] font-medium text-muted-foreground">
      {children}
      {required && <span className="text-destructive"> *</span>}
    </label>
  );
}

function CurrencyInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">₱</span>
      <input
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0.00"
        className={cn(fieldClass, "pl-7")}
      />
    </div>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors",
        checked ? "bg-primary" : "bg-border",
      )}
    >
      <span
        className={cn(
          "pointer-events-none block h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

function FormSection({
  id,
  icon: Icon,
  title,
  collapsed,
  onToggle,
  badge,
  children,
}: {
  id: string;
  icon: any;
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted">
          <Icon size={14} className="text-muted-foreground" />
        </div>
        <span className="flex-1 text-[13px] font-semibold text-foreground">{title}</span>
        {badge && (
          <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {badge}
          </span>
        )}
        {collapsed ? <ChevronRight size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
      </button>
      {!collapsed && (
        <div className="border-t border-border px-4 pb-4 pt-3">
          {children}
        </div>
      )}
    </div>
  );
}
