"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/app/auth-context";
import {
  useServiceHistoryByVehicleQuery,
  useServiceHistoryByCustomerQuery,
  type ServiceHistoryEntry,
} from "@/hooks/use-report-queries";

// ── Role-gating stub ──
const USER_ROLE: "ADMIN" | "MANAGER" | "ADVISOR" | "TECHNICIAN" = "ADMIN";
const isFinancialRole = USER_ROLE === "ADMIN" || USER_ROLE === "MANAGER";

// ── Status styling ──
const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: "bg-muted text-muted-foreground",
  CHECKED_IN: "bg-blue-50 text-blue-700",
  ESTIMATING: "bg-amber-50 text-amber-700",
  APPROVED: "bg-indigo-50 text-indigo-700",
  WAITING_FOR_PARTS: "bg-orange-50 text-orange-700",
  READY_FOR_BAY: "bg-cyan-50 text-cyan-700",
  IN_PROGRESS: "bg-violet-50 text-violet-700",
  WORK_COMPLETED: "bg-emerald-50 text-emerald-700",
  INVOICED: "bg-green-50 text-green-700",
  CLOSED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-50 text-red-700",
};

const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "Scheduled",
  CHECKED_IN: "Checked In",
  ESTIMATING: "Estimating",
  APPROVED: "Approved",
  WAITING_FOR_PARTS: "Waiting Parts",
  READY_FOR_BAY: "Bay Queue",
  IN_PROGRESS: "In Progress",
  WORK_COMPLETED: "Work Done",
  INVOICED: "Invoiced",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
};

// ── Customer/Vehicle search types ──
interface CustomerResult {
  id: string;
  name: string;
  phone: string;
}

interface VehicleResult {
  id: string;
  customerId: string;
  make: string;
  model: string;
  year: number | null;
  plateNo: string | null;
}

// ── Sort config ──
type SortField = "jobNo" | "status" | "createdAt" | "grandTotal";
type SortDir = "asc" | "desc";

/* ═══════════════════════════════════════════════
 * Service History — Vehicle & Customer Lookup
 * ═══════════════════════════════════════════════ */
export default function ServiceHistoryPage() {
  const { token, locationId } = useAuth();
  const [mode, setMode] = useState<"vehicle" | "customer">("customer");
  const [searchTerm, setSearchTerm] = useState("");
  const [searching, setSearching] = useState(false);

  // ── Customer search results ──
  const [customers, setCustomers] = useState<CustomerResult[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  // ── Vehicle search results ──
  const [vehicles, setVehicles] = useState<VehicleResult[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);

  // ── Sorting ──
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // ── Search handler ──
  const handleSearch = async () => {
    if (!searchTerm.trim()) return;
    setSearching(true);
    setSelectedCustomerId(null);
    setSelectedVehicleId(null);

    try {
      if (mode === "customer") {
        const result = await apiFetch<{ data: CustomerResult[] }>(
          `/customers?search=${encodeURIComponent(searchTerm)}&limit=20`,
          { token: token, locationId: locationId },
        );
        setCustomers(result.data);
        setVehicles([]);
      } else {
        // Vehicle search: search customers first, then their vehicles
        const result = await apiFetch<{ data: CustomerResult[] }>(
          `/customers?search=${encodeURIComponent(searchTerm)}&limit=10`,
          { token: token, locationId: locationId },
        );
        setCustomers(result.data);
        // Load vehicles for all matching customers
        const allVehicles: VehicleResult[] = [];
        for (const c of result.data) {
          try {
            const vResult = await apiFetch<{ data: VehicleResult[] }>(
              `/customers/${c.id}/vehicles`,
              { token: token, locationId: locationId },
            );
            allVehicles.push(...vResult.data);
          } catch {
            // Skip if customer has no vehicles endpoint
          }
        }
        setVehicles(allVehicles);
      }
    } catch {
      setCustomers([]);
      setVehicles([]);
    } finally {
      setSearching(false);
    }
  };

  // ── History queries ──
  const vehicleHistoryQuery = useServiceHistoryByVehicleQuery(
    selectedVehicleId ?? "",
    token,
    locationId,
  );

  const customerHistoryQuery = useServiceHistoryByCustomerQuery(
    selectedCustomerId ?? "",
    token,
    locationId,
  );

  const historyData: ServiceHistoryEntry[] = useMemo(() => {
    if (selectedVehicleId) return vehicleHistoryQuery.data?.data ?? [];
    if (selectedCustomerId) return customerHistoryQuery.data?.data ?? [];
    return [];
  }, [selectedVehicleId, selectedCustomerId, vehicleHistoryQuery.data, customerHistoryQuery.data]);

  const isLoadingHistory =
    (selectedVehicleId && vehicleHistoryQuery.isLoading) ||
    (selectedCustomerId && customerHistoryQuery.isLoading);

  // ── Client-side sort ──
  const sortedHistory = useMemo(() => {
    const sorted = [...historyData].sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;

      switch (sortField) {
        case "jobNo":
          aVal = a.jobNo;
          bVal = b.jobNo;
          break;
        case "status":
          aVal = a.status;
          bVal = b.status;
          break;
        case "createdAt":
          aVal = a.createdAt;
          bVal = b.createdAt;
          break;
        case "grandTotal":
          aVal = parseFloat(a.grandTotal);
          bVal = parseFloat(b.grandTotal);
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [historyData, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const sortIcon = (field: SortField) => {
    if (sortField !== field) return " \u2195";
    return sortDir === "asc" ? " \u2191" : " \u2193";
  };

  // ── Summary ──
  const totalSpend = useMemo(
    () => historyData.reduce((sum, r) => sum + parseFloat(r.grandTotal), 0),
    [historyData],
  );

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      {/* ── Page Header ── */}
      <div className="flex items-center gap-3">
        <a
          href="/reports"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Reports
        </a>
        <span className="text-muted-foreground">/</span>
        <h1 className="text-lg font-semibold">Service History</h1>
      </div>

      {/* ── Search Controls ── */}
      <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
        {/* Mode toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => { setMode("customer"); setSelectedVehicleId(null); }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === "customer"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:text-foreground"
            }`}
          >
            By Customer
          </button>
          <button
            onClick={() => { setMode("vehicle"); setSelectedCustomerId(null); }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === "vehicle"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:text-foreground"
            }`}
          >
            By Vehicle
          </button>
        </div>

        {/* Search input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder={
              mode === "customer"
                ? "Search by customer name or phone..."
                : "Search by customer name to find their vehicles..."
            }
            className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          />
          <button
            onClick={handleSearch}
            disabled={searching || !searchTerm.trim()}
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
          >
            {searching ? "Searching..." : "Search"}
          </button>
        </div>

        {/* ── Customer Results ── */}
        {mode === "customer" && customers.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">
              Select a customer ({customers.length} found)
            </p>
            <div className="flex flex-wrap gap-2">
              {customers.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setSelectedCustomerId(c.id);
                    setSelectedVehicleId(null);
                  }}
                  className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    selectedCustomerId === c.id
                      ? "border-primary bg-primary/5 font-medium"
                      : "border-border hover:border-primary/30"
                  }`}
                >
                  {c.name}
                  <span className="ml-1 text-muted-foreground">{c.phone}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Vehicle Results ── */}
        {mode === "vehicle" && vehicles.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">
              Select a vehicle ({vehicles.length} found)
            </p>
            <div className="flex flex-wrap gap-2">
              {vehicles.map((v) => (
                <button
                  key={v.id}
                  onClick={() => {
                    setSelectedVehicleId(v.id);
                    setSelectedCustomerId(null);
                  }}
                  className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    selectedVehicleId === v.id
                      ? "border-primary bg-primary/5 font-medium"
                      : "border-border hover:border-primary/30"
                  }`}
                >
                  {v.make} {v.model}
                  {v.year ? ` (${v.year})` : ""}
                  {v.plateNo && (
                    <span className="ml-1 font-mono text-xs text-muted-foreground">
                      {v.plateNo}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Empty states ── */}
        {mode === "customer" && customers.length === 0 && searchTerm && !searching && (
          <p className="text-xs text-muted-foreground">No customers found.</p>
        )}
        {mode === "vehicle" && vehicles.length === 0 && searchTerm && !searching && (
          <p className="text-xs text-muted-foreground">No vehicles found.</p>
        )}
      </div>

      {/* ── History Summary ── */}
      {historyData.length > 0 && (
        <div className="flex gap-6 rounded-lg border border-border bg-muted/10 px-4 py-3 text-sm">
          <div>
            <span className="text-muted-foreground">Total Visits: </span>
            <span className="font-medium">{historyData.length}</span>
          </div>
          {isFinancialRole && (
            <div>
              <span className="text-muted-foreground">Total Spend: </span>
              <span className="font-medium">{fmtCurrency(totalSpend)}</span>
            </div>
          )}
          {historyData[0] && (
            <div>
              <span className="text-muted-foreground">Vehicle: </span>
              <span className="font-medium">
                {historyData[0].vehicleMake} {historyData[0].vehicleModel}
                {historyData[0].vehicleYear ? ` (${historyData[0].vehicleYear})` : ""}
                {historyData[0].vehiclePlate && ` — ${historyData[0].vehiclePlate}`}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── History Data Grid ── */}
      {(selectedCustomerId || selectedVehicleId) && (
        <div className="rounded-lg border border-border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left text-xs font-medium text-muted-foreground">
                  <SortHeader field="jobNo" label="Job #" onClick={toggleSort} icon={sortIcon} />
                  <SortHeader field="status" label="Status" onClick={toggleSort} icon={sortIcon} />
                  <th scope="col" className="px-4 py-2">Location</th>
                  <th scope="col" className="px-4 py-2">Customer</th>
                  <th scope="col" className="px-4 py-2">Vehicle</th>
                  <th scope="col" className="px-4 py-2 text-right">Odometer</th>
                  <SortHeader field="createdAt" label="Created" onClick={toggleSort} icon={sortIcon} />
                  <th scope="col" className="px-4 py-2">Completed</th>
                  {isFinancialRole && (
                    <>
                      <th scope="col" className="px-4 py-2 text-right">Labor</th>
                      <th scope="col" className="px-4 py-2 text-right">Parts</th>
                      <SortHeader field="grandTotal" label="Total" onClick={toggleSort} icon={sortIcon} align="right" />
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {isLoadingHistory ? (
                  <tr>
                    <td
                      colSpan={isFinancialRole ? 11 : 8}
                      className="px-4 py-12 text-center text-muted-foreground"
                    >
                      Loading service history...
                    </td>
                  </tr>
                ) : sortedHistory.length === 0 ? (
                  <tr>
                    <td
                      colSpan={isFinancialRole ? 11 : 8}
                      className="px-4 py-12 text-center text-muted-foreground"
                    >
                      No service history found.
                    </td>
                  </tr>
                ) : (
                  sortedHistory.map((entry) => (
                    <tr
                      key={entry.jobCardId}
                      className="border-b border-border last:border-0 hover:bg-muted/20"
                    >
                      <td className="px-4 py-2 font-mono text-xs font-medium">
                        <a
                          href={`/service/job-cards/${entry.jobNo}`}
                          className="text-primary underline-offset-2 hover:underline"
                        >
                          {entry.jobNo}
                        </a>
                      </td>
                      <td className="px-4 py-2">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[entry.status] ?? "bg-muted text-muted-foreground"}`}>
                          {STATUS_LABELS[entry.status] ?? entry.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs">{entry.locationName}</td>
                      <td className="px-4 py-2 text-xs">
                        {entry.customerName}
                        <span className="ml-1 text-muted-foreground">{entry.customerPhone}</span>
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {entry.vehicleMake} {entry.vehicleModel}
                        {entry.vehicleYear ? ` (${entry.vehicleYear})` : ""}
                        {entry.vehiclePlate && (
                          <span className="ml-1 font-mono text-muted-foreground">
                            {entry.vehiclePlate}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs">
                        {entry.odometerReading != null
                          ? entry.odometerReading.toLocaleString()
                          : "\u2014"}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {fmtDate(entry.createdAt)}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {entry.completedAt ? fmtDate(entry.completedAt) : "\u2014"}
                      </td>
                      {isFinancialRole && (
                        <>
                          <td className="px-4 py-2 text-right font-mono text-xs">
                            {fmtCurrency(parseFloat(entry.totalLaborRevenue))}
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-xs">
                            {fmtCurrency(parseFloat(entry.totalPartsRevenue))}
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-xs font-medium">
                            {fmtCurrency(parseFloat(entry.grandTotal))}
                          </td>
                        </>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Prompt state ── */}
      {!selectedCustomerId && !selectedVehicleId && !searching && (
        <div className="rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">
            Search for a {mode === "customer" ? "customer" : "vehicle"} above to
            view service history.
          </p>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
 * Subcomponents
 * ═══════════════════════════════════════════════ */

function SortHeader({
  field,
  label,
  onClick,
  icon,
  align = "left",
}: {
  field: SortField;
  label: string;
  onClick: (field: SortField) => void;
  icon: (field: SortField) => string;
  align?: "left" | "right";
}) {
  return (
    <th
      scope="col"
      className={`cursor-pointer select-none px-4 py-2 transition-colors hover:text-foreground ${align === "right" ? "text-right" : "text-left"}`}
      onClick={() => onClick(field)}
    >
      {label}
      <span className="text-muted-foreground/60">{icon(field)}</span>
    </th>
  );
}

// ── Utilities ──

function fmtCurrency(value: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2,
  }).format(value);
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}
