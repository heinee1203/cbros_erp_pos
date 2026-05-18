"use client";

import { useState, useCallback } from "react";
import { useAuth } from "../auth-context";
import { useDashboard, type LowStockItem, type RecentActivityEntry } from "@/hooks/use-dashboard";
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
  CheckCircle2,
  ChevronDown,
  ShoppingCart,
  LayoutDashboard,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtNum, fmtDateTime, timeAgo } from "@/lib/format";
import { REF_TYPE_LABELS, REF_TYPE_COLORS, isFinancialRole, isOperationalRole } from "@/lib/constants";
import { EmptyState, LoadingState, PageHeader, WorkspacePage } from "@/components/ui/layout";
import { ProductReorderModal, ReorderSuccessToast, useProductReorder } from "@/components/procurement/reorder-workflow";
import { KpiCard as HeadlineCard, WorkbenchLink as QuickAction, WorkbenchPanel as DashboardPanel } from "@/components/ui/workbench";

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
  const { token, locationId, user } = useAuth();
  const role = user?.role ?? "";
  const { data, isLoading, isError } = useDashboard(token, locationId);

  const {
    modal: reorderModal,
    loadingProductId: reorderLoading,
    successMessage,
    reorder,
    snooze: handleSnooze,
    dismissModal,
    createDraftPO,
    viewExistingDraft,
  } = useProductReorder({ token, locationId, invalidateKeys: [["dashboard"]] });

  const handleReorder = useCallback((item: LowStockItem) => {
    void reorder({ productId: item.productId, productName: item.productName });
  }, [reorder]);

  if (isLoading || !data) {
    return <LoadingState label="Loading dashboard..." />;
  }

  if (isError) {
    return (
      <WorkspacePage className="max-w-[1400px]">
        <EmptyState
          icon={AlertTriangle}
          label="Dashboard Offline"
          title="Failed to load dashboard data"
          description="The ERP overview could not fetch its live inventory and operations signals. Please retry in a moment."
        />
      </WorkspacePage>
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
    <WorkspacePage className="max-w-[1400px]">
      <PageHeader
        icon={LayoutDashboard}
        eyebrow="ERP Command Center"
        title="Dashboard"
        description={`${scope.locationName} · Real-time inventory, procurement, service, and transfer signals.`}
      />

      {/* ── Section 1: Action Queue ── */}
      <DashboardPanel
        icon={AlertTriangle}
        eyebrow="Action Queue"
        title="Needs Your Attention"
      >
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
                  className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/45"
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
      </DashboardPanel>

      {/* ── Section 2: Headline KPI Strip ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
      <DashboardPanel
        title="Low Stock Items"
        description={`${lowStockItems.length} items at or below reorder point`}
        action={
          <Link
            href="/procurement/stock-levels?belowReorder=true"
            className="text-[12px] font-semibold text-foreground transition-colors hover:text-foreground/75"
          >
            View all &rarr;
          </Link>
        }
      >
        <div className="overflow-x-auto px-4 py-3">
          {lowStockItems.length === 0 ? (
            <div className="py-6 text-center text-[12px] text-muted-foreground">
              No low stock items at this location.
            </div>
          ) : (
            <table className="w-full min-w-[820px] text-[12px]">
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
      </DashboardPanel>

      {/* Success toast */}
      <ReorderSuccessToast message={successMessage} />

      {/* Reorder modal */}
      {reorderModal && (
        <ProductReorderModal
          item={reorderModal.item}
          data={reorderModal.data}
          onDismiss={dismissModal}
          onAddToExisting={(po) => viewExistingDraft(po.poNumber)}
          onCreateNew={() => createDraftPO(reorderModal.item, reorderModal.data.lastSupplier, reorderModal.data.suggestedQty)}
          onSnooze={(days) => handleSnooze(reorderModal.item.productId, days)}
        />
      )}

      {/* ── Section 4: Activity Feed ── */}
      <DashboardPanel
        title="Recent Activity"
        description="Latest stock movements"
        action={
          <Link
            href="/procurement/inventory-history"
            className="text-[12px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            Full history &rarr;
          </Link>
        }
      >
        <div className="overflow-x-auto px-4 py-3">
          {recentActivity.length === 0 ? (
            <div className="py-6 text-center text-[12px] text-muted-foreground">
              No recent activity at this location.
            </div>
          ) : (
            <table className="w-full min-w-[720px] text-[12px]">
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
      </DashboardPanel>

      {/* ── Section 5: Quick Actions ── */}
      <DashboardPanel title="Quick Actions" description="Fast paths into common ERP workflows">
        <div className="flex flex-wrap gap-2 px-4 py-3">
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
      </DashboardPanel>
    </WorkspacePage>
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
