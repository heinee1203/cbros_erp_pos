"use client";

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
  TrendingUp,
  Percent,
  ArrowUp,
  ArrowDown,
  Clock,
  Plus,
  History,
  Loader2,
  MapPin,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtNum, fmtPercent, fmtDateTime } from "@/lib/format";

/* ─── Constants ─── */

const CATEGORY_LABELS: Record<string, string> = {
  TIRES: "Tires",
  LUBRICANTS: "Lubricants",
  HARD_PARTS: "Hard Parts",
  ACCESSORIES: "Accessories",
  LABOR_SERVICES: "Services",
};

const REF_TYPE_LABELS: Record<string, string> = {
  SALE: "Sale",
  RECEIVING: "Receiving",
  TRANSFER_IN: "Transfer In",
  TRANSFER_OUT: "Transfer Out",
  ADJUSTMENT: "Adjustment",
  RETURN: "Return",
  STOCKTAKE: "Stocktake",
  VOID: "Void",
  JOB_CARD_ISSUE: "Job Issue",
  JOB_CARD_RETURN: "Job Return",
  OPENING_BALANCE: "Opening",
};

const REF_TYPE_COLORS: Record<string, string> = {
  SALE: "bg-blue-100 text-blue-700",
  RECEIVING: "bg-emerald-100 text-emerald-700",
  TRANSFER_IN: "bg-indigo-100 text-indigo-700",
  TRANSFER_OUT: "bg-violet-100 text-violet-700",
  ADJUSTMENT: "bg-amber-100 text-amber-700",
  RETURN: "bg-orange-100 text-orange-700",
  STOCKTAKE: "bg-slate-100 text-slate-700",
  VOID: "bg-red-100 text-red-700",
  JOB_CARD_ISSUE: "bg-rose-100 text-rose-700",
  JOB_CARD_RETURN: "bg-teal-100 text-teal-700",
  OPENING_BALANCE: "bg-gray-100 text-gray-600",
};

/* ─── Role Helpers ─── */

function isFinancialRole(role: string): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

function isOperationalRole(role: string): boolean {
  return role === "ADMIN" || role === "MANAGER" || role === "WAREHOUSE_STAFF";
}

/* ─── Format Helpers ─── */

/** Dashboard-specific: treats zero as "—" unlike the shared fmtPeso */
function fmtPeso(v: string | number): string {
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n) || n === 0) return "\u2014";
  return `\u20B1${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(v: string | number): string {
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return "\u2014";
  return fmtPercent(n);
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/* ─── Page Component ─── */

export default function DashboardPage() {
  const { token, locationId, user } = useAuth();
  const role = user?.role ?? "";
  const { data, isLoading, isError } = useDashboard(token, locationId);

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

  const { scope, inventory, procurement, transfers, jobCards, kpi, lowStockItems, recentActivity } = data;

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

      {/* ── Section 1: KPI Strip ── */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {/* Inventory KPIs — all roles */}
        <KPICard
          icon={Package}
          label="Total SKUs"
          value={fmtNum(inventory.totalSkus)}
          href="/inventory"
        />
        <KPICard
          icon={AlertTriangle}
          label="Low Stock"
          value={fmtNum(inventory.lowStock)}
          href="/procurement/stock-levels?stockStatus=LOW_STOCK"
          alert={inventory.lowStock > 0}
        />
        <KPICard
          icon={XCircle}
          label="Out of Stock"
          value={fmtNum(inventory.outOfStock)}
          href="/procurement/stock-levels?stockStatus=OUT_OF_STOCK"
          alert={inventory.outOfStock > 0}
          critical={inventory.outOfStock > 0}
        />

        {/* Procurement/Service — operational roles */}
        {isOperationalRole(role) && procurement && (
          <KPICard
            icon={FileText}
            label="Open POs"
            value={fmtNum(procurement.openPOs)}
            href="/procurement/purchase-orders"
          />
        )}
        {isOperationalRole(role) && transfers && (
          <KPICard
            icon={ArrowLeftRight}
            label="Open Transfers"
            value={fmtNum(transfers.openTransfers)}
            href="/procurement/transfer-orders"
          />
        )}
        {isOperationalRole(role) && jobCards && (
          <KPICard
            icon={Wrench}
            label="Active Jobs"
            value={fmtNum(jobCards.activeJobs)}
            href="/service/job-cards"
          />
        )}

        {/* Financial KPIs — ADMIN/MANAGER only */}
        {isFinancialRole(role) && kpi && (
          <>
            <KPICard
              icon={TrendingUp}
              label="Gross Profit"
              value={fmtPeso(kpi.totalGrossProfit)}
              href="/reports/job-margins"
              financial
            />
            <KPICard
              icon={Percent}
              label="Avg Margin"
              value={fmtPct(kpi.avgGrossMarginPct)}
              href="/reports/job-margins"
              financial
            />
          </>
        )}
      </div>

      {/* ── Section 2: Attention Panels (2-col) ── */}
      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        {/* Low Stock Items */}
        <AttentionPanel
          title="Low Stock Items"
          subtitle={`${lowStockItems.length} items at or below reorder point`}
          href="/procurement/stock-levels?belowReorder=true"
          linkLabel="View all"
          isEmpty={lowStockItems.length === 0}
          emptyMessage="No low stock items at this location."
        >
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border/60 text-[11px] font-medium text-muted-foreground">
                <th scope="col" className="pb-2 pr-3 text-left">Item</th>
                <th scope="col" className="pb-2 px-2 text-left">Category</th>
                <th scope="col" className="pb-2 px-2 text-right">Available</th>
                <th scope="col" className="pb-2 px-2 text-right">Reorder Pt</th>
                <th scope="col" className="pb-2 pl-2 text-right">On Hand</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {lowStockItems.map((item) => (
                <LowStockRow key={item.productId + item.locationName} item={item} />
              ))}
            </tbody>
          </table>
        </AttentionPanel>

        {/* Active Job Cards — operational roles */}
        {isOperationalRole(role) && jobCards && (
          <AttentionPanel
            title="Job Card Status"
            subtitle="Current service workload"
            href="/service/job-cards"
            linkLabel="View all"
            isEmpty={jobCards.activeJobs === 0}
            emptyMessage="No active job cards."
          >
            <div className="space-y-2">
              <JobStatusRow
                label="Waiting for Parts"
                count={jobCards.waitingForParts}
                alert={jobCards.waitingForParts > 0}
              />
              <JobStatusRow label="In Progress" count={jobCards.inProgress} />
              <JobStatusRow label="Work Completed" count={jobCards.workCompleted} />
              <div className="border-t border-border/60 pt-2">
                <JobStatusRow label="Total Active" count={jobCards.activeJobs} bold />
              </div>
            </div>

            {/* Procurement mini-stats if available */}
            {procurement && (
              <div className="mt-4 border-t border-border/60 pt-3">
                <div className="mb-2 text-[11px] font-medium text-muted-foreground">Procurement</div>
                <div className="space-y-2">
                  <JobStatusRow label="Draft POs" count={procurement.draftPOs} />
                  <JobStatusRow
                    label="Awaiting Receiving"
                    count={procurement.awaitingReceiving}
                    alert={procurement.awaitingReceiving > 0}
                  />
                  {transfers && (
                    <JobStatusRow
                      label="Transfers in Transit"
                      count={transfers.inTransit}
                      alert={transfers.inTransit > 0}
                    />
                  )}
                </div>
              </div>
            )}
          </AttentionPanel>
        )}

        {/* If not operational role, show a simpler panel */}
        {!isOperationalRole(role) && (
          <AttentionPanel
            title="Inventory Summary"
            subtitle="Stock health overview"
            href="/inventory"
            linkLabel="View items"
            isEmpty={false}
            emptyMessage=""
          >
            <div className="space-y-2">
              <JobStatusRow label="In Stock" count={inventory.inStock} />
              <JobStatusRow label="Low Stock" count={inventory.lowStock} alert={inventory.lowStock > 0} />
              <JobStatusRow label="Out of Stock" count={inventory.outOfStock} alert={inventory.outOfStock > 0} />
              <div className="border-t border-border/60 pt-2">
                <JobStatusRow label="Total SKUs" count={inventory.totalSkus} bold />
              </div>
            </div>
          </AttentionPanel>
        )}
      </div>

      {/* ── Section 3: Recent Activity ── */}
      <div className="mb-5">
        <AttentionPanel
          title="Recent Activity"
          subtitle="Latest stock movements"
          href="/procurement/inventory-history"
          linkLabel="Full history"
          isEmpty={recentActivity.length === 0}
          emptyMessage="No recent activity at this location."
        >
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
              {recentActivity.map((entry) => (
                <ActivityRow key={entry.id} entry={entry} />
              ))}
            </tbody>
          </table>
        </AttentionPanel>
      </div>

      {/* ── Section 4: Quick Actions ── */}
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
            <QuickAction icon={Package} label="Point of Sale" href="/pos" />
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── KPI Card ─── */

function KPICard({
  icon: Icon,
  label,
  value,
  href,
  alert = false,
  critical = false,
  financial = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  href: string;
  alert?: boolean;
  critical?: boolean;
  financial?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-3 rounded-xl border bg-background px-4 py-3 transition-all hover:shadow-sm",
        critical
          ? "border-destructive/30 hover:border-destructive/50"
          : alert
            ? "border-warning/30 hover:border-warning/50"
            : "border-border hover:border-border/80",
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          critical
            ? "bg-destructive/10 text-destructive"
            : alert
              ? "bg-warning/10 text-warning"
              : financial
                ? "bg-emerald-50 text-emerald-600"
                : "bg-muted text-muted-foreground",
        )}
      >
        <Icon size={15} strokeWidth={1.75} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] font-medium text-muted-foreground">{label}</div>
        <div
          className={cn(
            "truncate text-[15px] font-semibold tabular-nums leading-tight",
            critical
              ? "text-destructive"
              : alert
                ? "text-warning"
                : "text-foreground",
          )}
        >
          {value}
        </div>
      </div>
    </Link>
  );
}

/* ─── Attention Panel ─── */

function AttentionPanel({
  title,
  subtitle,
  href,
  linkLabel,
  isEmpty,
  emptyMessage,
  children,
}: {
  title: string;
  subtitle: string;
  href: string;
  linkLabel: string;
  isEmpty: boolean;
  emptyMessage: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div>
          <div className="text-[13px] font-semibold text-foreground">{title}</div>
          <div className="text-[11px] text-muted-foreground">{subtitle}</div>
        </div>
        <Link
          href={href}
          className="text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {linkLabel} &rarr;
        </Link>
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        {isEmpty ? (
          <div className="py-6 text-center text-[12px] text-muted-foreground">
            {emptyMessage}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

/* ─── Low Stock Row ─── */

function LowStockRow({ item }: { item: LowStockItem }) {
  const isOut = item.stockLevel === 0;

  return (
    <tr className="hover:bg-muted/40 transition-colors">
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
        {CATEGORY_LABELS[item.category] ?? item.category}
      </td>
      <td
        className={cn(
          "py-[5px] px-2 text-right tabular-nums font-medium",
          isOut ? "text-destructive" : item.available <= 0 ? "text-destructive" : "text-warning",
        )}
      >
        {fmtNum(item.available)}
      </td>
      <td className="py-[5px] px-2 text-right tabular-nums text-muted-foreground">
        {fmtNum(item.reorderPoint)}
      </td>
      <td
        className={cn(
          "py-[5px] pl-2 text-right tabular-nums",
          isOut ? "text-destructive" : "text-foreground",
        )}
      >
        {fmtNum(item.stockLevel)}
      </td>
    </tr>
  );
}

/* ─── Job Status Row ─── */

function JobStatusRow({
  label,
  count,
  alert = false,
  bold = false,
}: {
  label: string;
  count: number;
  alert?: boolean;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-[12px]">
      <span className={cn(bold ? "font-medium text-foreground" : "text-muted-foreground")}>
        {label}
      </span>
      <span
        className={cn(
          "tabular-nums font-medium",
          alert && count > 0
            ? "text-warning"
            : bold
              ? "text-foreground"
              : "text-foreground",
        )}
      >
        {alert && count > 0 && (
          <AlertTriangle size={11} className="mr-1 inline text-warning" />
        )}
        {fmtNum(count)}
      </span>
    </div>
  );
}

/* ─── Activity Row ─── */

function ActivityRow({ entry }: { entry: RecentActivityEntry }) {
  const isIn = entry.direction === "IN";

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
        {entry.referenceNo && (
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
          {isIn ? "+" : ""}{entry.changeQuantity}
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
