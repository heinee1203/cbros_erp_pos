"use client";

import { useState, useCallback } from "react";
import { useAuth } from "../auth-context";
import { useDashboard, type LowStockItem, type RecentActivityEntry } from "@/hooks/use-dashboard";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import Link from "next/link";
import {
  Package,
  AlertTriangle,
  XCircle,
  FileText,
  ArrowLeftRight,
  Wrench,
  ArrowUp,
  ArrowDown,
  Clock,
  Plus,
  History,
  Loader2,
  MapPin,
  CheckCircle2,
  ChevronDown,
  ShoppingCart,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtNum, fmtDateTime, timeAgo } from "@/lib/format";
import { REF_TYPE_LABELS, REF_TYPE_COLORS, isFinancialRole, isOperationalRole } from "@/lib/constants";
import { ModalShell } from "@/app/inventory/components/modal-shell";

/* ─── Reorder Types ─── */

interface PendingOrdersData {
  draftPOs: { poId: string; poNumber: string; supplierId: string; supplierName: string; quantity: number; status: string }[];
  submittedPOs: { poId: string; poNumber: string; supplierId: string; supplierName: string; quantityOrdered: number; quantityReceived: number; quantityRemaining: number; status: string }[];
  backorders: { backorderId: string; sourcePoNumber: string; supplierId: string; supplierName: string; quantityOutstanding: number; status: string; waitUntil: string | null }[];
  lastSupplier: { supplierId: string; supplierName: string; lastCost: string; lastPoNumber: string; lastPoDate: string } | null;
  suggestedQty: number;
}

/* ─── Format Helpers ─── */

/** Dashboard-specific: treats zero as "—" unlike the shared fmtPeso */
function fmtPeso(v: string | number): string {
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n) || n === 0) return "\u2014";
  return `\u20B1${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/* ─── Activity Grouping ─── */

interface GroupedActivity extends RecentActivityEntry {
  count: number;
  totalChange: number;
}

function groupActivity(entries: RecentActivityEntry[]): GroupedActivity[] {
  const groups: GroupedActivity[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last.productName === entry.productName && last.referenceType === entry.referenceType) {
      last.count++;
      last.totalChange += entry.changeQuantity;
    } else {
      groups.push({ ...entry, count: 1, totalChange: entry.changeQuantity });
    }
  }
  return groups.slice(0, 8);
}

/* ─── Action Queue Item Definition ─── */

interface ActionQueueItem {
  count: number;
  color: "red" | "amber";
  description: string;
  icon: LucideIcon;
  href: string;
  /** Which roles can see this item */
  roles: "all" | "inventory" | "inventory+transfers";
}

/* ─── Page Component ─── */

export default function DashboardPage() {
  const { token, locationId, apiLocationId, user } = useAuth();
  const role = user?.role ?? "";
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useDashboard(token, locationId);

  // ── Reorder state ──
  const [reorderModal, setReorderModal] = useState<{ item: LowStockItem; data: PendingOrdersData } | null>(null);
  const [reorderLoading, setReorderLoading] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleReorder = useCallback(async (item: LowStockItem) => {
    if (!token || !locationId) return;
    setReorderLoading(item.productId);
    try {
      const pendingData = await apiFetch<PendingOrdersData>(`/products/${item.productId}/pending-orders`, { token, locationId });
      const hasExisting = pendingData.draftPOs.length > 0 || pendingData.submittedPOs.length > 0 || pendingData.backorders.length > 0;
      if (hasExisting) {
        setReorderModal({ item, data: pendingData });
      } else {
        await addToDraftPO(item, pendingData.lastSupplier, pendingData.suggestedQty);
      }
    } catch {
      // API error — user can retry via the button
    } finally {
      setReorderLoading(null);
    }
  }, [token, locationId]);

  const addToDraftPO = useCallback(async (
    item: LowStockItem,
    lastSupplier: PendingOrdersData["lastSupplier"],
    suggestedQty: number,
  ) => {
    if (!token || !locationId) return;
    if (!lastSupplier) {
      router.push(`/procurement/purchase-orders/new?productId=${item.productId}&qty=${suggestedQty}`);
      return;
    }

    // Check for existing draft PO to same supplier
    const drafts = await apiFetch<{ data: { id: string; poNo: string }[] }>(
      `/procurement/purchase-orders?status=DRAFT&supplierId=${lastSupplier.supplierId}&limit=1`,
      { token, locationId },
    );

    if (drafts.data && drafts.data.length > 0) {
      const draft = drafts.data[0];
      await apiFetch(`/procurement/purchase-orders/${draft.id}/lines`, {
        token, locationId,
        method: "POST",
        body: JSON.stringify({ productId: item.productId, orderedQty: suggestedQty, unitCost: lastSupplier.lastCost }),
      });
      setReorderModal(null);
      setSuccessMsg(`Added ${suggestedQty} units to ${draft.poNo}`);
      setTimeout(() => setSuccessMsg(null), 4000);
      router.push(`/procurement/purchase-orders/${draft.poNo}`);
    } else {
      // Navigate to new PO page with supplier + cost pre-filled for user review
      setReorderModal(null);
      const params = new URLSearchParams({
        productId: item.productId,
        qty: String(suggestedQty),
        supplierId: lastSupplier.supplierId,
        unitCost: lastSupplier.lastCost,
      });
      router.push(`/procurement/purchase-orders/new?${params.toString()}`);
    }
  }, [token, locationId, apiLocationId, router]);

  const handleSnooze = useCallback(async (productId: string, days: number) => {
    if (!token || !locationId) return;
    await apiFetch(`/products/${productId}/snooze-reorder`, {
      token, locationId,
      method: "POST",
      body: JSON.stringify({ days }),
    });
    setReorderModal(null);
    setSuccessMsg(`Snoozed for ${days} days`);
    setTimeout(() => setSuccessMsg(null), 4000);
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }, [token, locationId, queryClient]);

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
        <span className="ml-2 text-[13px] text-muted-foreground">Loading dashboard...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center py-32">
        <span className="text-[13px] text-destructive">Failed to load dashboard data.</span>
      </div>
    );
  }

  const { scope, inventory, procurement, transfers, jobCards, lowStockItems, recentActivity } = data;

  /* Build action queue items */
  const allActions: ActionQueueItem[] = [
    {
      count: inventory.outOfStock,
      color: "red",
      description: "items out of stock",
      icon: XCircle,
      href: "/procurement/stock-levels?stockStatus=OUT_OF_STOCK",
      roles: "inventory",
    },
    {
      count: inventory.lowStock,
      color: "amber",
      description: "items below reorder point",
      icon: AlertTriangle,
      href: "/procurement/stock-levels?stockStatus=LOW_STOCK",
      roles: "inventory",
    },
    {
      count: procurement?.awaitingReceiving ?? 0,
      color: "amber",
      description: "POs awaiting receiving",
      icon: FileText,
      href: "/procurement/purchase-orders",
      roles: "all",
    },
    {
      count: transfers?.inTransit ?? 0,
      color: "amber",
      description: "transfers in transit",
      icon: ArrowLeftRight,
      href: "/procurement/transfer-orders",
      roles: "inventory+transfers",
    },
    {
      count: jobCards?.waitingForParts ?? 0,
      color: "amber",
      description: "job cards waiting for parts",
      icon: Wrench,
      href: "/service/job-cards",
      roles: "all",
    },
    {
      count: procurement?.draftPOs ?? 0,
      color: "amber",
      description: "draft purchase orders",
      icon: FileText,
      href: "/procurement/purchase-orders",
      roles: "all",
    },
  ];

  /* Role-gate the action queue */
  const visibleActions = allActions.filter((item) => {
    if (item.count === 0) return false;
    if (role === "CASHIER") return item.roles === "inventory";
    if (role === "WAREHOUSE_STAFF") return item.roles === "inventory" || item.roles === "inventory+transfers";
    // ADMIN, MANAGER — see all
    return true;
  });

  const groupedActivity = groupActivity(recentActivity);

  return (
    <div className="mx-auto max-w-[1400px]">
      {/* ── Page Header ── */}
      <div className="mb-5">
        <h1 className="text-[18px] font-semibold text-foreground">Dashboard</h1>
        <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <MapPin size={12} />
          <span>{scope.locationName}</span>
          <span className="text-border">&middot;</span>
          <span>Real-time overview</span>
        </div>
      </div>

      {/* ── Section 1: Action Queue ── */}
      <div className="mb-5 rounded-xl border border-border bg-background">
        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
          <AlertTriangle size={14} className="text-amber-600" />
          <span className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            Needs Your Attention
          </span>
        </div>
        <div className="divide-y divide-border/40">
          {visibleActions.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-4 text-[13px] text-emerald-600">
              <CheckCircle2 size={16} />
              <span className="font-medium">All clear &mdash; no pending actions</span>
            </div>
          ) : (
            visibleActions.map((item) => {
              const Icon = item.icon;
              const isRed = item.color === "red";
              return (
                <Link
                  key={item.description}
                  href={item.href}
                  className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40"
                >
                  <div
                    className={cn(
                      "w-[3px] self-stretch rounded-full",
                      isRed ? "bg-destructive" : "bg-amber-500",
                    )}
                  />
                  <Icon
                    size={14}
                    className={cn(
                      "shrink-0",
                      isRed ? "text-destructive" : "text-amber-600",
                    )}
                  />
                  <div className="flex flex-1 items-center gap-1.5 text-[13px]">
                    <span
                      className={cn(
                        "font-bold tabular-nums",
                        isRed ? "text-destructive" : "text-amber-600",
                      )}
                    >
                      {fmtNum(item.count)}
                    </span>
                    <span className="text-foreground">{item.description}</span>
                  </div>
                  <span className="text-[12px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                    View &rarr;
                  </span>
                </Link>
              );
            })
          )}
        </div>
      </div>

      {/* ── Section 2: Headline KPI Strip ── */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Total SKUs — all roles */}
        <HeadlineCard
          icon={Package}
          iconColor="bg-blue-50 text-blue-600"
          label="Total Items"
          value={fmtNum(inventory.totalSkus)}
          subtitle={`${fmtNum(inventory.inStock)} in stock`}
        />

        {/* Low Stock — all roles */}
        <HeadlineCard
          icon={AlertTriangle}
          iconColor={inventory.lowStock > 0 ? "bg-amber-50 text-amber-600" : "bg-muted text-muted-foreground"}
          label="Low Stock"
          value={fmtNum(inventory.lowStock)}
          subtitle={`${fmtNum(inventory.outOfStock)} critical`}
          alert={inventory.lowStock > 0}
        />

        {/* Active Jobs — operational roles */}
        {isOperationalRole(role) && jobCards && (
          <HeadlineCard
            icon={Wrench}
            iconColor="bg-violet-50 text-violet-600"
            label="Active Jobs"
            value={fmtNum(jobCards.activeJobs)}
            subtitle={`${fmtNum(jobCards.workCompleted)} completed`}
          />
        )}

        {/* Open POs — operational roles */}
        {isOperationalRole(role) && procurement && (
          <HeadlineCard
            icon={FileText}
            iconColor="bg-emerald-50 text-emerald-600"
            label="Open POs"
            value={fmtNum(procurement.openPOs)}
            subtitle={`${fmtNum(procurement.awaitingReceiving)} to receive`}
          />
        )}
      </div>

      {/* ── Section 3: Low Stock Table ── */}
      <div className="mb-5 rounded-xl border border-border bg-background">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <div>
            <div className="text-[13px] font-semibold text-foreground">Low Stock Items</div>
            <div className="text-[11px] text-muted-foreground">
              {lowStockItems.length} items at or below reorder point
            </div>
          </div>
          <Link
            href="/procurement/stock-levels?belowReorder=true"
            className="text-[12px] font-medium text-foreground transition-colors hover:text-foreground/80"
          >
            View all &rarr;
          </Link>
        </div>
        <div className="px-4 py-3">
          {lowStockItems.length === 0 ? (
            <div className="py-6 text-center text-[12px] text-muted-foreground">
              No low stock items at this location.
            </div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border/60 text-[11px] font-medium text-muted-foreground">
                  <th scope="col" className="pb-2 pr-2 text-left">Urgency</th>
                  <th scope="col" className="pb-2 pr-3 text-left">Item</th>
                  <th scope="col" className="pb-2 px-2 text-left">Category</th>
                  <th scope="col" className="pb-2 px-2 text-right">Available</th>
                  <th scope="col" className="pb-2 px-2 text-right">Reorder Pt</th>
                  <th scope="col" className="pb-2 px-2 text-right">On Hand</th>
                  <th scope="col" className="pb-2 px-2 text-right">Last Sold</th>
                  <th scope="col" className="pb-2 pl-2 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {lowStockItems.slice(0, 5).map((item) => (
                  <LowStockRow
                    key={item.productId + item.locationName}
                    item={item}
                    onReorder={handleReorder}
                    onSnooze={handleSnooze}
                    loading={reorderLoading === item.productId}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Success toast */}
      {successMsg && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-[13px] font-medium text-emerald-800 shadow-lg animate-in slide-in-from-bottom-2">
          <CheckCircle2 size={15} />
          {successMsg}
        </div>
      )}

      {/* Reorder modal */}
      {reorderModal && (
        <ReorderModal
          item={reorderModal.item}
          data={reorderModal.data}
          onDismiss={() => setReorderModal(null)}
          onAddToExisting={(po) => { setReorderModal(null); router.push(`/procurement/purchase-orders/${po.poNumber}`); }}
          onCreateNew={() => addToDraftPO(reorderModal.item, reorderModal.data.lastSupplier, reorderModal.data.suggestedQty)}
          onSnooze={(days) => handleSnooze(reorderModal.item.productId, days)}
        />
      )}

      {/* ── Section 4: Activity Feed ── */}
      <div className="mb-5 rounded-xl border border-border bg-background">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <div>
            <div className="text-[13px] font-semibold text-foreground">Recent Activity</div>
            <div className="text-[11px] text-muted-foreground">Latest stock movements</div>
          </div>
          <Link
            href="/procurement/inventory-history"
            className="text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Full history &rarr;
          </Link>
        </div>
        <div className="px-4 py-3">
          {recentActivity.length === 0 ? (
            <div className="py-6 text-center text-[12px] text-muted-foreground">
              No recent activity at this location.
            </div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border/60 text-[11px] font-medium text-muted-foreground">
                  <th scope="col" className="pb-2 pr-2 text-left">Time</th>
                  <th scope="col" className="pb-2 px-2 text-left">Item</th>
                  <th scope="col" className="pb-2 px-2 text-left">Type</th>
                  <th scope="col" className="pb-2 px-2 text-right">Qty</th>
                  <th scope="col" className="pb-2 px-2 text-right">Balance</th>
                  <th scope="col" className="pb-2 pl-2 text-left">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {groupedActivity.map((entry) => (
                  <ActivityRow key={entry.id} entry={entry} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Section 5: Quick Actions ── */}
      <div>
        <div className="mb-2 text-[12px] font-medium text-muted-foreground">Quick Actions</div>
        <div className="flex flex-wrap gap-2">
          {/* All roles: basic inventory */}
          <QuickAction icon={History} label="Inventory History" href="/procurement/inventory-history" />

          {/* Operational roles */}
          {isOperationalRole(role) && (
            <>
              <QuickAction icon={Plus} label="New Adjustment" href="/procurement/stock-adjustments" />
              <QuickAction icon={ArrowLeftRight} label="New Transfer" href="/procurement/transfer-orders" />
              <QuickAction icon={FileText} label="New Purchase Order" href="/procurement/purchase-orders" />
            </>
          )}

          {/* Service roles */}
          {isOperationalRole(role) && (
            <QuickAction icon={Wrench} label="New Job Card" href="/service/job-cards" />
          )}

          {/* Cashier / Sales */}
          {(role === "CASHIER" || role === "SALES" || isFinancialRole(role)) && (
            <QuickAction icon={Package} label="Sales Receipts" href="/sales/receipts" />
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Headline KPI Card ─── */

function HeadlineCard({
  icon: Icon,
  iconColor,
  label,
  value,
  subtitle,
  alert = false,
}: {
  icon: LucideIcon;
  iconColor: string;
  label: string;
  value: string;
  subtitle: string;
  alert?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-background px-4 py-3",
        alert ? "border-amber-300" : "border-border",
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <div
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full",
            iconColor,
          )}
        >
          <Icon size={14} strokeWidth={1.75} />
        </div>
        <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      </div>
      <div className="text-[20px] font-semibold tabular-nums leading-tight text-foreground">
        {value}
      </div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</div>
    </div>
  );
}

/* ─── Low Stock Row ─── */

function LowStockRow({ item, onReorder, onSnooze, loading }: { item: LowStockItem; onReorder: (item: LowStockItem) => void; onSnooze: (productId: string, days: number) => void; loading: boolean }) {
  const [showSnooze, setShowSnooze] = useState(false);
  const isOut = item.stockLevel === 0;
  const isLow = item.stockLevel > 0 && item.stockLevel <= item.reorderPoint;

  return (
    <tr className="hover:bg-muted/40 transition-colors">
      <td className="py-[5px] pr-2">
        <span
          className={cn(
            "inline-block h-2.5 w-2.5 rounded-full",
            isOut ? "bg-destructive" : isLow ? "bg-amber-500" : "bg-muted",
          )}
          title={isOut ? "Out of stock" : isLow ? "Low stock" : ""}
        />
      </td>
      <td className="py-[5px] pr-3">
        <Link
          href={`/inventory?search=${encodeURIComponent(item.sku)}`}
          className="font-medium text-foreground hover:underline"
          title={item.productName}
        >
          {item.productName}
        </Link>
        <div className="mt-px font-mono text-[10px] text-muted-foreground">{item.sku}</div>
      </td>
      <td className="py-[5px] px-2 text-muted-foreground">
        {item.categoryName || "\u2014"}
      </td>
      <td
        className={cn(
          "py-[5px] px-2 text-right tabular-nums font-medium",
          isOut ? "text-destructive" : item.available <= 0 ? "text-destructive" : "text-amber-600",
        )}
      >
        {fmtNum(item.available)}
      </td>
      <td className="py-[5px] px-2 text-right tabular-nums text-muted-foreground">
        {fmtNum(item.reorderPoint)}
      </td>
      <td
        className={cn(
          "py-[5px] px-2 text-right tabular-nums",
          isOut ? "text-destructive" : "text-foreground",
        )}
      >
        {fmtNum(item.stockLevel)}
      </td>
      <td className="py-[5px] px-2 text-right text-muted-foreground whitespace-nowrap">
        {item.lastSoldAt ? timeAgo(item.lastSoldAt) : "\u2014"}
      </td>
      <td className="py-[5px] pl-2 text-right">
        <div className="inline-flex items-center gap-0.5">
          <button
            onClick={() => onReorder(item)}
            disabled={loading}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            {loading ? <Loader2 size={11} className="animate-spin" /> : <ShoppingCart size={11} />}
            Reorder
          </button>
          <div className="relative">
            <button
              onClick={() => setShowSnooze(!showSnooze)}
              className="rounded p-0.5 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-muted-foreground"
              title="Snooze"
            >
              <ChevronDown size={10} />
            </button>
            {showSnooze && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowSnooze(false)} />
                <div className="absolute right-0 top-full z-50 mt-1 min-w-[110px] rounded-md border border-border bg-background shadow-lg">
                  {[7, 14, 30, 90].map((days) => (
                    <button
                      key={days}
                      onClick={() => { setShowSnooze(false); onSnooze(item.productId, days); }}
                      className="block w-full px-3 py-1.5 text-[11px] text-left text-muted-foreground hover:bg-muted hover:text-foreground transition-colors first:rounded-t-md last:rounded-b-md"
                    >
                      Snooze {days}d
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

/* ─── Reorder Modal ─── */

function ReorderModal({
  item,
  data,
  onDismiss,
  onAddToExisting,
  onCreateNew,
  onSnooze,
}: {
  item: LowStockItem;
  data: PendingOrdersData;
  onDismiss: () => void;
  onAddToExisting: (po: PendingOrdersData["draftPOs"][0]) => void;
  onCreateNew: () => void;
  onSnooze: (days: number) => void;
}) {
  const [showSnooze, setShowSnooze] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const handleAction = async (fn: () => Promise<void> | void) => {
    setActionLoading(true);
    try { await fn(); } catch { /* parent handles */ }
    setActionLoading(false);
  };

  return (
    <ModalShell title={`Reorder: ${item.productName}`} onClose={onDismiss} wide>
      {/* Existing orders warning */}
      <div className="space-y-2 mb-4">
        <p className="text-[12px] font-medium text-amber-600 flex items-center gap-1.5">
          <AlertTriangle size={13} />
          This item has pending orders:
        </p>

        {data.draftPOs.map((po) => (
          <div key={po.poId} className="flex justify-between text-[12px] bg-muted/50 p-2 rounded">
            <span>{po.poNumber} <span className="text-muted-foreground">(Draft)</span> — {po.quantity} units</span>
            <span className="text-muted-foreground">{po.supplierName}</span>
          </div>
        ))}

        {data.submittedPOs.map((po) => (
          <div key={po.poId} className="flex justify-between text-[12px] bg-blue-50 dark:bg-blue-950/20 p-2 rounded">
            <span>{po.poNumber} <span className="text-muted-foreground">({po.status})</span> — {po.quantityRemaining} remaining</span>
            <span className="text-muted-foreground">{po.supplierName}</span>
          </div>
        ))}

        {data.backorders.map((bo) => (
          <div key={bo.backorderId} className="flex justify-between text-[12px] bg-orange-50 dark:bg-orange-950/20 p-2 rounded">
            <span>Backorder{bo.sourcePoNumber ? ` from ${bo.sourcePoNumber}` : ""} — {bo.quantityOutstanding} pending</span>
            <span className="text-muted-foreground">{bo.supplierName}</span>
          </div>
        ))}
      </div>

      {/* Suggested qty */}
      <div className="text-[12px] text-muted-foreground mb-5">
        Suggested reorder qty: <strong className="text-foreground">{data.suggestedQty}</strong>
        <span className="ml-1">(reorder point - current stock)</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 justify-end flex-wrap">
        <button
          onClick={onDismiss}
          className="px-3 py-1.5 border border-border rounded-md text-[12px] font-medium hover:bg-muted transition-colors"
        >
          Dismiss
        </button>

        {/* Snooze dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowSnooze(!showSnooze)}
            className="flex items-center gap-1 px-3 py-1.5 border border-border rounded-md text-[12px] font-medium hover:bg-muted transition-colors"
          >
            Snooze <ChevronDown size={12} />
          </button>
          {showSnooze && (
            <div className="absolute bottom-full mb-1 right-0 bg-background border border-border rounded-md shadow-lg z-10 min-w-[100px]">
              {[7, 14, 30, 90].map((days) => (
                <button
                  key={days}
                  onClick={() => { setShowSnooze(false); onSnooze(days); }}
                  className="block w-full px-3 py-1.5 text-[12px] text-left hover:bg-muted transition-colors first:rounded-t-md last:rounded-b-md"
                >
                  {days} days
                </button>
              ))}
            </div>
          )}
        </div>

        {data.draftPOs.length > 0 && (
          <button
            onClick={() => onAddToExisting(data.draftPOs[0])}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-[12px] font-medium hover:bg-blue-700 transition-colors"
          >
            View {data.draftPOs[0].poNumber}
          </button>
        )}

        <button
          onClick={() => handleAction(onCreateNew)}
          disabled={actionLoading}
          className="px-3 py-1.5 bg-emerald-600 text-white rounded-md text-[12px] font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
        >
          Create New PO
        </button>
      </div>
    </ModalShell>
  );
}

/* ─── Activity Row (Grouped) ─── */

function ActivityRow({ entry }: { entry: GroupedActivity }) {
  const isIn = entry.direction === "IN";
  const isGrouped = entry.count > 1;

  return (
    <tr className="hover:bg-muted/40 transition-colors">
      <td className="py-[5px] pr-2 text-muted-foreground whitespace-nowrap" title={fmtDateTime(entry.createdAt)}>
        <div className="flex items-center gap-1">
          <Clock size={10} className="text-muted-foreground/60" />
          <span>{timeAgo(entry.createdAt)}</span>
        </div>
      </td>
      <td className="py-[5px] px-2">
        <div className="max-w-[200px] truncate font-medium text-foreground" title={entry.productName}>
          {entry.productName}
          {isGrouped && (
            <span className="ml-1 text-[11px] font-normal text-muted-foreground">
              &mdash; {entry.count} adjustments
            </span>
          )}
        </div>
      </td>
      <td className="py-[5px] px-2">
        <span
          className={cn(
            "inline-flex items-center rounded px-1.5 py-px text-[10px] font-medium",
            REF_TYPE_COLORS[entry.referenceType] ?? "bg-gray-100 text-gray-600",
          )}
        >
          {REF_TYPE_LABELS[entry.referenceType] ?? entry.referenceType}
        </span>
        {entry.referenceNo && !isGrouped && (
          <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
            #{entry.referenceNo}
          </span>
        )}
      </td>
      <td className="py-[5px] px-2 text-right tabular-nums font-medium whitespace-nowrap">
        <span className={isIn ? "text-emerald-600" : "text-foreground"}>
          {isIn ? (
            <ArrowUp size={10} className="mr-0.5 inline" />
          ) : (
            <ArrowDown size={10} className="mr-0.5 inline" />
          )}
          {isIn ? "+" : ""}{isGrouped ? entry.totalChange : entry.changeQuantity}
        </span>
      </td>
      <td className="py-[5px] px-2 text-right tabular-nums text-muted-foreground">
        {fmtNum(entry.balanceAfter)}
      </td>
      <td className="py-[5px] pl-2 truncate max-w-[100px] text-muted-foreground">
        {entry.actorName ?? "System"}
      </td>
    </tr>
  );
}

/* ─── Quick Action ─── */

function QuickAction({
  icon: Icon,
  label,
  href,
}: {
  icon: LucideIcon;
  label: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-[12px] font-medium text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] transition-all hover:bg-muted hover:shadow-sm"
    >
      <Icon size={13} strokeWidth={1.75} className="text-muted-foreground" />
      {label}
    </Link>
  );
}
