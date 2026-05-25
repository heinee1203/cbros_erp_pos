"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Percent, Plus, Search, X, Pencil, Trash2, ToggleLeft, ToggleRight, ChevronRight, Clock, Loader2, Users, Tag } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import { useConfirm } from "@/components/confirm-dialog";
import { useCategories } from "@/hooks/use-categories";
import { useBrands } from "@/hooks/use-brands";
import { useProductFamilies } from "@/hooks/use-products";
import { useLocations } from "@/hooks/use-locations";

/* ── Types ── */
interface DiscountRule {
  id: string; name: string; description: string | null; type: string; value: string;
  scope: string; scopeIds: string[]; minQuantity: number | null; minAmount: string | null;
  customerTierId: string | null; tierName: string | null;
  startDate: string | null; endDate: string | null; isActive: boolean;
  priority: number; stackable: boolean; locationIds: string[] | null;
  createdAt: string; updatedAt: string;
}
interface CustomerTier {
  id: string; name: string; description: string | null; defaultDiscount: string;
  color: string | null; sortOrder: number; isActive: boolean; customerCount: number;
}

type Tab = "rules" | "tiers" | "promos";

const TYPE_LABELS: Record<string, string> = { percentage: "Percentage", fixed_amount: "Fixed Amount", fixed_price: "Fixed Price", buy_x_get_y: "Buy X Get Y" };
const SCOPE_LABELS: Record<string, string> = { all: "All Items", category: "Category", brand: "Brand", family: "Family", product: "Product" };

function ruleStatus(rule: DiscountRule): { label: string; color: string } {
  if (!rule.isActive) return { label: "INACTIVE", color: "bg-muted text-muted-foreground" };
  const now = new Date();
  if (rule.startDate && new Date(rule.startDate) > now) return { label: "SCHEDULED", color: "bg-blue-500/10 text-blue-600" };
  if (rule.endDate && new Date(rule.endDate) < now) return { label: "EXPIRED", color: "bg-red-500/10 text-red-600" };
  return { label: "ACTIVE", color: "bg-emerald-500/10 text-emerald-600" };
}

function fmtValue(rule: DiscountRule): string {
  const v = parseFloat(rule.value);
  if (rule.type === "percentage") return `${v}% off`;
  if (rule.type === "fixed_amount") return `₱${v.toLocaleString()} off`;
  if (rule.type === "fixed_price") return `₱${v.toLocaleString()} fixed`;
  return String(v);
}

/* ── Page ── */
export default function DiscountsPage() {
  const { token, locationId } = useAuth();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("rules");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<DiscountRule | null>(null);
  const [showTierForm, setShowTierForm] = useState(false);
  const [editingTier, setEditingTier] = useState<CustomerTier | null>(null);

  // Data
  const rulesQuery = useQuery<{ data: DiscountRule[] }>({ queryKey: ["discounts"], queryFn: () => apiFetch("/discounts", { token, locationId }), enabled: !!token && !!locationId });
  const tiersQuery = useQuery<{ data: CustomerTier[] }>({ queryKey: ["discount-tiers"], queryFn: () => apiFetch("/discounts/tiers", { token, locationId }), enabled: !!token && !!locationId });

  const rules = rulesQuery.data?.data ?? [];
  const tiers = tiersQuery.data?.data ?? [];

  // Filters
  const filtered = useMemo(() => {
    let result = tab === "promos" ? rules.filter(r => r.startDate || r.endDate || r.type === "buy_x_get_y") : rules;
    if (search.length >= 2) {
      const q = search.toLowerCase();
      result = result.filter(r => r.name.toLowerCase().includes(q) || (r.description ?? "").toLowerCase().includes(q));
    }
    return result;
  }, [rules, search, tab]);

  // Promos grouping
  const activePromos = filtered.filter(r => { const s = ruleStatus(r); return s.label === "ACTIVE"; });
  const scheduledPromos = filtered.filter(r => ruleStatus(r).label === "SCHEDULED");
  const expiredPromos = filtered.filter(r => ruleStatus(r).label === "EXPIRED");

  // Mutations
  const toggleMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/discounts/${id}/toggle`, { token, locationId, method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["discounts"] }),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/discounts/${id}`, { token, locationId, method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["discounts"] }),
  });

  const handleDeleteRule = async (rule: DiscountRule) => {
    const ok = await confirm({
      title: "Delete discount rule?",
      message: `Delete "${rule.name}"? This removes the rule from pricing calculations.`,
      confirmLabel: "Delete Rule",
      variant: "danger",
    });
    if (ok) deleteMut.mutate(rule.id);
  };

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]"><Percent size={16} className="text-primary" /></div>
          <h1 className="text-[18px] font-semibold tracking-tight text-foreground">Discounts & Pricing Rules</h1>
        </div>
        <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">Volume discounts, customer tiers, and promotional pricing for CBROS Autoparts.</p>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex items-center gap-4 border-b border-border">
        {([
          { key: "rules" as Tab, label: "Discount Rules", count: rules.length },
          { key: "tiers" as Tab, label: "Customer Tiers", count: tiers.length },
          { key: "promos" as Tab, label: "Promotions", count: rules.filter(r => r.startDate || r.endDate || r.type === "buy_x_get_y").length },
        ]).map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setSearch(""); }}
            className={cn("px-3 py-2 text-sm font-medium border-b-2 transition-colors",
              tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t.label}
            {t.count > 0 && <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* ── Tab: Discount Rules ── */}
      {tab === "rules" && (
        <>
          <div className="mb-3 flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search rules..."
                className="h-8 w-full rounded-lg border border-border bg-background pl-9 pr-8 text-[12px] outline-none focus:border-primary/40" />
              {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"><X size={12} /></button>}
            </div>
            <button onClick={() => { setEditingRule(null); setShowForm(true); }}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[12px] font-semibold text-primary-foreground hover:bg-primary/90">
              <Plus size={14} /> New Rule
            </button>
          </div>

          {rulesQuery.isLoading ? (
            <div className="flex items-center justify-center py-20"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Percent size={28} className="text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-foreground">{search ? "No matching rules" : "No discount rules yet"}</p>
              <p className="mt-1 text-xs text-muted-foreground">{search ? "Try a different search" : "Create your first discount rule to get started"}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(rule => {
                const status = ruleStatus(rule);
                return (
                  <div key={rule.id} className="rounded-xl border border-border bg-background p-4 hover:border-border/80 transition-colors">
                    <div className="flex items-start gap-3">
                      <button onClick={() => toggleMut.mutate(rule.id)} className="mt-0.5 shrink-0">
                        {rule.isActive ? <ToggleRight size={20} className="text-emerald-500" /> : <ToggleLeft size={20} className="text-muted-foreground" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">{rule.name}</span>
                          <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-bold uppercase", status.color)}>{status.label}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {fmtValue(rule)} {"\u2022"} {SCOPE_LABELS[rule.scope] ?? rule.scope}
                          {rule.scopeIds?.length > 0 && ` (${rule.scopeIds.length} items)`}
                          {rule.minQuantity && ` \u2022 Min qty: ${rule.minQuantity}`}
                          {rule.tierName && ` \u2022 Tier: ${rule.tierName}`}
                        </p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground/70">
                          {rule.locationIds ? `${rule.locationIds.length} locations` : "All locations"}
                          {rule.endDate ? ` \u2022 Ends ${new Date(rule.endDate).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}` : " \u2022 No expiry"}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => { setEditingRule(rule); setShowForm(true); }}
                          className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"><Pencil size={13} /></button>
                        <button onClick={() => void handleDeleteRule(rule)}
                          className="rounded p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Tab: Customer Tiers ── */}
      {tab === "tiers" && (
        <>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Assign pricing tiers to customers for automatic discounts</p>
            <button onClick={() => { setEditingTier(null); setShowTierForm(true); }}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[12px] font-semibold text-primary-foreground hover:bg-primary/90">
              <Plus size={14} /> New Tier
            </button>
          </div>

          {tiersQuery.isLoading ? (
            <div className="flex items-center justify-center py-20"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-2">
              {tiers.map(tier => (
                <div key={tier.id} className="flex items-center gap-3 rounded-xl border border-border bg-background p-4 hover:border-border/80 transition-colors">
                  <div className="h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: tier.color ?? "#9ca3af" }} />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold text-foreground">{tier.name}</span>
                    <p className="text-xs text-muted-foreground">
                      {parseFloat(tier.defaultDiscount)}% default discount {"\u2022"} {tier.customerCount} customer{tier.customerCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <button onClick={() => { setEditingTier(tier); setShowTierForm(true); }}
                    className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"><Pencil size={13} /></button>
                </div>
              ))}
            </div>
          )}
          <p className="mt-4 text-[11px] text-muted-foreground">Assign tiers to customers from the <a href="/customers" className="text-primary hover:underline">Customer List</a> page.</p>
        </>
      )}

      {/* ── Tab: Promotions ── */}
      {tab === "promos" && (
        <>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Time-limited offers and buy-X-get-Y deals</p>
            <button onClick={() => { setEditingRule(null); setShowForm(true); }}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[12px] font-semibold text-primary-foreground hover:bg-primary/90">
              <Plus size={14} /> New Promotion
            </button>
          </div>
          {rulesQuery.isLoading ? (
            <div className="flex items-center justify-center py-20"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-6">
              {activePromos.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-emerald-600">Active Now</h3>
                  <div className="space-y-2">
                    {activePromos.map(r => <PromoCard key={r.id} rule={r} onEdit={() => { setEditingRule(r); setShowForm(true); }} />)}
                  </div>
                </div>
              )}
              {scheduledPromos.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-blue-600">Upcoming</h3>
                  <div className="space-y-2">
                    {scheduledPromos.map(r => <PromoCard key={r.id} rule={r} onEdit={() => { setEditingRule(r); setShowForm(true); }} />)}
                  </div>
                </div>
              )}
              {expiredPromos.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-red-600">Expired</h3>
                  <div className="space-y-2">
                    {expiredPromos.map(r => <PromoCard key={r.id} rule={r} onEdit={() => { setEditingRule(r); setShowForm(true); }} />)}
                  </div>
                </div>
              )}
              {activePromos.length === 0 && scheduledPromos.length === 0 && expiredPromos.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Clock size={28} className="text-muted-foreground/30 mb-3" />
                  <p className="text-sm font-medium text-foreground">No promotions</p>
                  <p className="mt-1 text-xs text-muted-foreground">Create a discount rule with start/end dates to create a promotion</p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Rule Form Modal ── */}
      {showForm && (
        <RuleFormModal
          rule={editingRule}
          isPromo={tab === "promos" && !editingRule}
          tiers={tiers}
          token={token}
          locationId={locationId}
          onClose={() => { setShowForm(false); setEditingRule(null); }}
          onSaved={() => { setShowForm(false); setEditingRule(null); qc.invalidateQueries({ queryKey: ["discounts"] }); }}
        />
      )}

      {/* ── Tier Form Modal ── */}
      {showTierForm && (
        <TierFormModal
          tier={editingTier}
          token={token}
          locationId={locationId}
          onClose={() => { setShowTierForm(false); setEditingTier(null); }}
          onSaved={() => { setShowTierForm(false); setEditingTier(null); qc.invalidateQueries({ queryKey: ["discount-tiers"] }); }}
        />
      )}
    </div>
  );
}

/* ── Promo Card ── */
function PromoCard({ rule, onEdit }: { rule: DiscountRule; onEdit: () => void }) {
  const status = ruleStatus(rule);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-background p-4 hover:border-border/80 transition-colors cursor-pointer" onClick={onEdit}>
      <Tag size={16} className={cn(status.label === "ACTIVE" ? "text-emerald-500" : status.label === "SCHEDULED" ? "text-blue-500" : "text-muted-foreground")} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{rule.name}</span>
          <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-bold uppercase", status.color)}>{status.label}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {fmtValue(rule)}
          {rule.startDate && ` \u2022 From ${new Date(rule.startDate).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}`}
          {rule.endDate && ` to ${new Date(rule.endDate).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}`}
        </p>
      </div>
      <ChevronRight size={14} className="text-muted-foreground" />
    </div>
  );
}

/* ── Rule Form Modal ── */
function RuleFormModal({ rule, isPromo, tiers, token, locationId, onClose, onSaved }: {
  rule: DiscountRule | null; isPromo?: boolean; tiers: CustomerTier[]; token: string; locationId: string;
  onClose: () => void; onSaved: () => void;
}) {
  const isEdit = !!rule;
  const todayStr = new Date().toISOString().slice(0, 10);
  const [name, setName] = useState(rule?.name ?? "");
  const [description, setDescription] = useState(rule?.description ?? "");
  const [type, setType] = useState(rule?.type ?? (isPromo ? "buy_x_get_y" : "percentage"));
  const [value, setValue] = useState(rule?.value ?? "");
  const [scope, setScope] = useState(rule?.scope ?? "all");
  const [minQty, setMinQty] = useState(rule?.minQuantity?.toString() ?? "");
  const [minAmt, setMinAmt] = useState(rule?.minAmount ?? "");
  const [tierId, setTierId] = useState(rule?.customerTierId ?? "");
  const [startDate, setStartDate] = useState(rule?.startDate?.slice(0, 10) ?? (isPromo ? todayStr : ""));
  const [endDate, setEndDate] = useState(rule?.endDate?.slice(0, 10) ?? "");
  const [priority, setPriority] = useState(rule?.priority?.toString() ?? "0");
  const [stackable, setStackable] = useState(rule?.stackable ?? false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name || !value) return;
    setSaving(true);
    try {
      const body = {
        name, description: description || undefined, type, value,
        scope, scopeIds: [],
        minQuantity: minQty ? parseInt(minQty) : undefined,
        minAmount: minAmt || undefined,
        customerTierId: tierId || undefined,
        startDate: startDate ? `${startDate}T00:00:00Z` : undefined,
        endDate: endDate ? `${endDate}T23:59:59Z` : undefined,
        priority: parseInt(priority) || 0, stackable,
      };
      if (isEdit) {
        await apiFetch(`/discounts/${rule!.id}`, { token, locationId, method: "PUT", body: JSON.stringify(body) });
      } else {
        await apiFetch("/discounts", { token, locationId, method: "POST", body: JSON.stringify(body) });
      }
      onSaved();
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[10vh]" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-border bg-background shadow-xl max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-foreground">{isEdit ? "Edit Rule" : "Create Discount Rule"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Rule Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Mechanic Shop 10% Off"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Discount Type *</label>
              <select value={type} onChange={e => setType(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none">
                <option value="percentage">Percentage (%)</option>
                <option value="fixed_amount">Fixed Amount (₱)</option>
                <option value="fixed_price">Fixed Price (₱)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Value *</label>
              <input type="number" value={value} onChange={e => setValue(e.target.value)} placeholder={type === "percentage" ? "e.g. 10" : "e.g. 500"}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Applies To</label>
            <select value={scope} onChange={e => setScope(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none">
              <option value="all">All Items</option>
              <option value="category">Specific Categories</option>
              <option value="brand">Specific Brands</option>
              <option value="family">Specific Family</option>
              <option value="product">Specific Products</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Min Quantity</label>
              <input type="number" value={minQty} onChange={e => setMinQty(e.target.value)} placeholder="e.g. 6"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Min Amount (₱)</label>
              <input type="number" value={minAmt} onChange={e => setMinAmt(e.target.value)} placeholder="e.g. 5000"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Customer Tier</label>
            <select value={tierId} onChange={e => setTierId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none">
              <option value="">All Customers</option>
              {tiers.map(t => <option key={t.id} value={t.id}>{t.name} ({parseFloat(t.defaultDiscount)}%)</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Start Date</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">End Date</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Priority</label>
              <input type="number" value={priority} onChange={e => setPriority(e.target.value)} placeholder="0"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={stackable} onChange={e => setStackable(e.target.checked)} className="h-4 w-4 rounded accent-primary" />
                <span className="text-xs font-medium text-muted-foreground">Stackable with other discounts</span>
              </label>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted">Cancel</button>
          <button onClick={handleSubmit} disabled={saving || !name || !value}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {saving ? "Saving..." : isEdit ? "Update Rule" : "Create Rule"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Tier Form Modal ── */
function TierFormModal({ tier, token, locationId, onClose, onSaved }: {
  tier: CustomerTier | null; token: string; locationId: string;
  onClose: () => void; onSaved: () => void;
}) {
  const isEdit = !!tier;
  const [name, setName] = useState(tier?.name ?? "");
  const [desc, setDesc] = useState(tier?.description ?? "");
  const [discount, setDiscount] = useState(tier?.defaultDiscount ?? "0");
  const [color, setColor] = useState(tier?.color ?? "#3b82f6");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name) return;
    setSaving(true);
    try {
      const body = { name, description: desc || undefined, defaultDiscount: discount, color };
      if (isEdit) {
        await apiFetch(`/discounts/tiers/${tier!.id}`, { token, locationId, method: "PUT", body: JSON.stringify(body) });
      } else {
        await apiFetch("/discounts/tiers", { token, locationId, method: "POST", body: JSON.stringify(body) });
      }
      onSaved();
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[10vh]" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-border bg-background shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-foreground">{isEdit ? "Edit Tier" : "Create Customer Tier"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Tier Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Mechanic Shop"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Optional description"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Default Discount (%)</label>
              <input type="number" value={discount} onChange={e => setDiscount(e.target.value)} placeholder="e.g. 10"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Badge Color</label>
              <input type="color" value={color} onChange={e => setColor(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-border cursor-pointer" />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted">Cancel</button>
          <button onClick={handleSubmit} disabled={saving || !name}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {saving ? "Saving..." : isEdit ? "Update Tier" : "Create Tier"}
          </button>
        </div>
      </div>
    </div>
  );
}
