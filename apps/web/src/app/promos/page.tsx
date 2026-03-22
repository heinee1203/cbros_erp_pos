"use client";

import { useState } from "react";
import { Plus, Gift, Percent, Package, Tag } from "lucide-react";
import { useAuth } from "@/app/auth-context";
import { usePromos, useCreatePromo, useUpdatePromo, useDeactivatePromo, type PromoRule } from "@/hooks/use-promos";
import { useProductFamilies } from "@/hooks/use-products";
import { useCategories } from "@/hooks/use-categories";
import { useBrands } from "@/hooks/use-brands";

const RULE_TYPES = [
  { value: "BUY_X_GET_Y_FREE", label: "Buy X Get Y Free", icon: Gift },
  { value: "BOGO", label: "Buy N Get 1 Free", icon: Tag },
  { value: "BUY_X_GET_Y_DISCOUNT", label: "Buy X Get Y at Discount", icon: Percent },
  { value: "BUNDLE", label: "Bundle Deal", icon: Package },
];

const TRIGGER_TYPES = [
  { value: "PRODUCT", label: "Specific Product" },
  { value: "FAMILY", label: "Product Family" },
  { value: "CATEGORY", label: "Category" },
  { value: "BRAND", label: "Brand" },
  { value: "ANY", label: "Any Item" },
];

const REWARD_TYPES = [
  { value: "FREE_ITEM", label: "Free Item" },
  { value: "DISCOUNT_PERCENT", label: "Discount %" },
  { value: "DISCOUNT_AMOUNT", label: "Discount Amount" },
  { value: "FIXED_PRICE", label: "Fixed Price" },
];

const STATUS_STYLES: Record<string, string> = {
  active: "bg-success/10 text-success",
  inactive: "bg-muted text-muted-foreground",
  expired: "bg-destructive/10 text-destructive",
};

export default function PromoRulesPage() {
  const { token, locationId, loading: authLoading } = useAuth();
  const { data, isLoading } = usePromos(token, locationId);
  const createMut = useCreatePromo(token, locationId);
  const updateMut = useUpdatePromo(token, locationId);
  const deactivateMut = useDeactivatePromo(token, locationId);
  const familiesQuery = useProductFamilies(token, locationId);
  const categoriesQuery = useCategories(token, locationId, {});
  const brandsQuery = useBrands(token, locationId);

  const promos = data?.data ?? [];
  const families = familiesQuery.data?.data ?? [];
  const categories = categoriesQuery.data?.data ?? [];
  const brands = brandsQuery.data?.data ?? [];

  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ruleType, setRuleType] = useState("BUY_X_GET_Y_FREE");
  const [triggerType, setTriggerType] = useState("FAMILY");
  const [triggerId, setTriggerId] = useState("");
  const [minQuantity, setMinQuantity] = useState("1");
  const [rewardType, setRewardType] = useState("FREE_ITEM");
  const [rewardProductId, setRewardProductId] = useState("");
  const [rewardQty, setRewardQty] = useState("1");
  const [discountPercent, setDiscountPercent] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [priority, setPriority] = useState("0");
  const [maxUses, setMaxUses] = useState("");
  const [requiresApproval, setRequiresApproval] = useState(false);

  const resetForm = () => {
    setName(""); setDescription(""); setRuleType("BUY_X_GET_Y_FREE");
    setTriggerType("FAMILY"); setTriggerId(""); setMinQuantity("1");
    setRewardType("FREE_ITEM"); setRewardProductId(""); setRewardQty("1");
    setDiscountPercent(""); setDiscountAmount(""); setStartDate(""); setEndDate("");
    setPriority("0"); setMaxUses(""); setRequiresApproval(false);
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    await createMut.mutateAsync({
      name: name.trim(),
      description: description || undefined,
      ruleType,
      startDate: startDate || null,
      endDate: endDate || null,
      priority: parseInt(priority) || 0,
      maxUsesTotal: maxUses ? parseInt(maxUses) : null,
      requiresApproval,
      triggers: [{
        triggerType,
        triggerId: triggerId || null,
        minQuantity: parseInt(minQuantity) || 1,
      }],
      rewards: [{
        rewardType,
        productId: rewardProductId || null,
        quantity: parseInt(rewardQty) || 1,
        discountPercent: discountPercent ? parseFloat(discountPercent) : null,
        discountAmount: discountAmount ? parseFloat(discountAmount) : null,
        appliesTo: rewardType === "FREE_ITEM" ? "SPECIFIC_PRODUCT" : "TRIGGER_ITEMS",
      }],
    });
    resetForm();
    setShowCreate(false);
  };

  const getStatus = (p: PromoRule) => {
    if (!p.isActive) return "inactive";
    const today = new Date().toISOString().split("T")[0];
    if (p.endDate && p.endDate < today) return "expired";
    return "active";
  };

  const triggerOptions = triggerType === "FAMILY" ? families
    : triggerType === "CATEGORY" ? categories
    : triggerType === "BRAND" ? brands
    : [];

  const fc = "w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary";

  if (authLoading || isLoading) {
    return <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Promo Rules</h2>
          <p className="text-sm text-muted-foreground">Configure promotional deals for the POS</p>
        </div>
        <button onClick={() => { resetForm(); setShowCreate(true); }} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="mr-1 inline h-4 w-4" /> New Promo
        </button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Type</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Period</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Uses</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {promos.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">No promo rules yet. Click "New Promo" to create one.</td></tr>
            ) : promos.map((p, i) => {
              const status = getStatus(p);
              return (
                <tr key={p.id} className={`border-b border-border transition-colors hover:bg-accent ${i % 2 === 0 ? "bg-background" : "bg-muted/20"}`}>
                  <td className="px-3 py-2">
                    <div className="font-medium">{p.name}</div>
                    {p.description && <div className="text-[10px] text-muted-foreground truncate max-w-[200px]">{p.description}</div>}
                  </td>
                  <td className="px-3 py-2 text-xs">{RULE_TYPES.find(t => t.value === p.ruleType)?.label ?? p.ruleType}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[status]}`}>
                      {status === "active" ? "Active" : status === "expired" ? "Expired" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {p.startDate || p.endDate
                      ? `${p.startDate ? new Date(p.startDate).toLocaleDateString("en-PH", { month: "short", day: "numeric" }) : "—"} – ${p.endDate ? new Date(p.endDate).toLocaleDateString("en-PH", { month: "short", day: "numeric" }) : "∞"}`
                      : "Always"}
                  </td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums">
                    {p.usesCount}{p.maxUsesTotal ? `/${p.maxUsesTotal}` : "/∞"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => p.isActive ? deactivateMut.mutate(p.id) : updateMut.mutate({ id: p.id, isActive: true })}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      {p.isActive ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg bg-background p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-base font-semibold">New Promo Rule</h3>

            {/* Basic Info */}
            <div className="space-y-3 mb-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Name *</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Buy 4 Tires Get Free Alignment" className={fc} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Type *</label>
                <div className="grid grid-cols-2 gap-2">
                  {RULE_TYPES.map((t) => (
                    <label key={t.value} className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer text-xs ${ruleType === t.value ? "border-primary bg-primary/5" : "border-border"}`}>
                      <input type="radio" checked={ruleType === t.value} onChange={() => setRuleType(t.value)} className="sr-only" />
                      <t.icon size={14} className={ruleType === t.value ? "text-primary" : "text-muted-foreground"} />
                      {t.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Trigger */}
            <div className="mb-4 rounded-lg border border-border p-3">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Trigger — What Customer Must Buy</h4>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-muted-foreground">Trigger Type</label>
                  <select value={triggerType} onChange={(e) => { setTriggerType(e.target.value); setTriggerId(""); }} className={fc}>
                    {TRIGGER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                {triggerType !== "ANY" && (
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-muted-foreground">{triggerType === "FAMILY" ? "Family" : triggerType === "CATEGORY" ? "Category" : triggerType === "BRAND" ? "Brand" : "Product"}</label>
                    <select value={triggerId} onChange={(e) => setTriggerId(e.target.value)} className={fc}>
                      <option value="">Select…</option>
                      {triggerOptions.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-muted-foreground">Min Quantity</label>
                  <input type="number" min="1" value={minQuantity} onChange={(e) => setMinQuantity(e.target.value)} className={fc} />
                </div>
              </div>
            </div>

            {/* Reward */}
            <div className="mb-4 rounded-lg border border-border p-3">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reward — What Customer Gets</h4>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-muted-foreground">Reward Type</label>
                  <select value={rewardType} onChange={(e) => setRewardType(e.target.value)} className={fc}>
                    {REWARD_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
                {rewardType === "FREE_ITEM" && (
                  <>
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-muted-foreground">Free Product ID</label>
                      <input value={rewardProductId} onChange={(e) => setRewardProductId(e.target.value)} placeholder="Product UUID" className={fc} />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-muted-foreground">Quantity</label>
                      <input type="number" min="1" value={rewardQty} onChange={(e) => setRewardQty(e.target.value)} className={fc} />
                    </div>
                  </>
                )}
                {rewardType === "DISCOUNT_PERCENT" && (
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-muted-foreground">Discount %</label>
                    <input type="number" min="1" max="100" value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} placeholder="e.g., 50" className={fc} />
                  </div>
                )}
                {rewardType === "DISCOUNT_AMOUNT" && (
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-muted-foreground">Discount Amount (₱)</label>
                    <input type="number" min="1" value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} placeholder="e.g., 500" className={fc} />
                  </div>
                )}
              </div>
            </div>

            {/* Options */}
            <div className="mb-4 grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[10px] font-medium text-muted-foreground">Start Date</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={fc} />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium text-muted-foreground">End Date</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={fc} />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium text-muted-foreground">Priority</label>
                <input type="number" value={priority} onChange={(e) => setPriority(e.target.value)} className={fc} />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium text-muted-foreground">Max Total Uses</label>
                <input type="number" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="Unlimited" className={fc} />
              </div>
            </div>
            <label className="mb-4 flex items-center gap-2 text-xs">
              <input type="checkbox" checked={requiresApproval} onChange={(e) => setRequiresApproval(e.target.checked)} />
              Requires manager PIN to apply
            </label>

            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCreate(false)} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted">Cancel</button>
              <button onClick={handleCreate} disabled={!name.trim() || createMut.isPending} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {createMut.isPending ? "Creating…" : "Create Promo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
