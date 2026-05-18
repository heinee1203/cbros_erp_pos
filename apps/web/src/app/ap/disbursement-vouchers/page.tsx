"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText, Plus } from "lucide-react";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import { buildDisbursementVoucherHtml } from "@/lib/disbursement-voucher-html";

import type { DVRecord, Supplier, SortField, SortDir } from "./components/dv-types";
import { DVSummaryCards, type DVSummary } from "./components/dv-summary-cards";
import { DVFilters } from "./components/dv-filters";
import { DVTable } from "./components/dv-table";
import { VoidDialog } from "./components/void-dialog";
import { VoucherDetailModal } from "./components/voucher-detail-modal";

const EMPTY_SUMMARY: DVSummary = {
  totalCount: 0,
  confirmedCount: 0,
  confirmedAmt: 0,
  voidedCount: 0,
  voidedAmt: 0,
};

export default function DisbursementVoucherListPage() {
  const { token, locationId, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams() ?? new URLSearchParams();

  // Data
  const [records, setRecords] = useState<DVRecord[]>([]);
  const [summary, setSummary] = useState<DVSummary>(EMPTY_SUMMARY);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [includeVoided, setIncludeVoided] = useState(
    () => searchParams.get("includeVoided") === "1",
  );

  // Keep the includeVoided URL param in sync with state (shareable/refreshable).
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (includeVoided) params.set("includeVoided", "1");
    else params.delete("includeVoided");
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeVoided]);

  // Sort + pagination
  const [sortField, setSortField] = useState<SortField>("dvNumber");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Modals
  const [voidingDV, setVoidingDV] = useState<DVRecord | null>(null);
  const [viewingDV, setViewingDV] = useState<DVRecord | null>(null);

  // Fetch data
  const fetchData = useCallback(async () => {
    if (!token || !locationId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (includeVoided) params.set("includeVoided", "1");
      params.set("limit", "200");
      const res = await apiFetch<{ data: DVRecord[]; summary?: DVSummary }>(
        `/ap/disbursement-vouchers?${params.toString()}`,
        { token, locationId },
      );
      setRecords(res.data || []);
      if (res.summary) setSummary(res.summary);
    } catch {} finally { setLoading(false); }
  }, [token, locationId, search, statusFilter, dateFrom, dateTo, includeVoided]);

  const fetchSuppliers = useCallback(async () => {
    if (!token || !locationId) return;
    try {
      const res = await apiFetch<{ data: Supplier[] }>("/procurement/suppliers", { token, locationId });
      setSuppliers(res.data || []);
    } catch {}
  }, [token, locationId]);

  useEffect(() => {
    if (!authLoading && token && locationId) { fetchData(); fetchSuppliers(); }
  }, [authLoading, token, locationId, fetchData, fetchSuppliers]);

  // Client-side filtering for supplier + method (server handles search/status/date)
  const filtered = useMemo(() => {
    let rows = records;
    if (supplierFilter) rows = rows.filter((r) => r.supplierId === supplierFilter);
    if (methodFilter) rows = rows.filter((r) => r.paymentMethod === methodFilter);
    return rows;
  }, [records, supplierFilter, methodFilter]);

  // Sort handler
  const handleSort = (field: SortField) => {
    if (field === sortField) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir(field === "supplierName" ? "asc" : "desc"); }
  };

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [search, statusFilter, supplierFilter, methodFilter, dateFrom, dateTo, includeVoided]);

  // Hint: rows are empty under "All Statuses" default filter, but voided rows exist
  // and would show if the toggle were on.
  const hiddenVoidedHint =
    !loading && filtered.length === 0 && !statusFilter && !includeVoided && summary.voidedCount > 0;

  // Actions
  const handleReprint = async (r: DVRecord) => {
    try {
      if (r.status === "DRAFT") {
        await apiFetch(`/ap/disbursement-vouchers/${r.id}/print`, { token, locationId, method: "POST" });
      }
      const dv = await apiFetch<any>(`/ap/disbursement-vouchers/${r.id}`, { token, locationId });
      const html = buildDisbursementVoucherHtml({
        dvNumber: dv.dvNumber, supplierName: dv.supplierName,
        amount: dv.netAmount ?? dv.amount, grossAmount: dv.grossAmount, totalDeductions: dv.totalDeductions,
        paymentDate: dv.paymentDate, soaNumber: dv.soaNumber || undefined,
        soaDateFrom: dv.soaDateFrom || undefined, soaDateTo: dv.soaDateTo || undefined,
        soaRefs: (dv.soaRefs || []).map((r: any) => ({ soaNumber: r.soaNumber, allocatedAmount: r.allocatedAmount, dateFrom: r.dateFrom, dateTo: r.dateTo })),
        remarks: dv.remarks,
        payments: (dv.payments || []).map((p: any) => ({
          paymentMethod: p.paymentMethod, amount: p.amount, referenceNumber: p.referenceNumber,
          bankName: p.bankName, transactionDate: p.transactionDate, platform: p.platform,
        })),
        deductions: (dv.deductions || []).map((d: any) => ({ description: d.description, amount: d.amount })),
        soaCreditMemos: (dv.soaCreditMemos || []).map((cm: any) => ({ invoiceNumber: cm.invoiceNumber, amount: cm.amount })),
        isVoided: dv.status === "VOIDED", voidReason: dv.voidReason,
      });
      const w = window.open("", "_blank");
      if (w) { w.document.write(html); w.document.close(); w.onload = () => w.print(); }
      fetchData();
    } catch {}
  };

  const handleConfirm = async (r: DVRecord) => {
    if (!confirm(`Confirm payment of ${r.amount.toLocaleString("en-PH", { style: "currency", currency: "PHP" })} to ${r.supplierName}?`)) return;
    try {
      await apiFetch(`/ap/disbursement-vouchers/${r.id}/confirm`, { token, locationId, method: "POST" });
      setViewingDV(null);
      fetchData();
    } catch (err: any) { alert(err.message || "Failed to confirm"); }
  };

  const handleVoidConfirm = async (reason: string) => {
    if (!voidingDV) return;
    try {
      await apiFetch(`/ap/disbursement-vouchers/${voidingDV.id}/void`, {
        token, locationId, method: "POST", body: JSON.stringify({ reason }),
      });
      setVoidingDV(null);
      setViewingDV(null);
      fetchData();
    } catch (err: any) { alert(err.message || "Failed to void"); }
  };

  if (authLoading) return <div className="flex items-center justify-center py-20"><div className="text-sm text-muted-foreground">Loading...</div></div>;

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]">
            <FileText size={16} className="text-primary" />
          </div>
          <div>
            <h1 className="text-[18px] font-semibold tracking-tight">Disbursement Vouchers</h1>
            <p className="text-[13px] text-muted-foreground">Manage supplier payment vouchers</p>
          </div>
        </div>
        <button
          onClick={() => router.push("/ap/disbursement-vouchers/new")}
          className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[12px] font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus size={14} /> New Voucher
        </button>
      </div>

      <DVSummaryCards summary={summary} />

      <DVFilters
        suppliers={suppliers}
        supplierFilter={supplierFilter} onSupplierChange={setSupplierFilter}
        statusFilter={statusFilter} onStatusChange={setStatusFilter}
        methodFilter={methodFilter} onMethodChange={setMethodFilter}
        dateFrom={dateFrom} dateTo={dateTo}
        onDateRangeChange={(s, e) => { setDateFrom(s); setDateTo(e); }}
        onSearchChange={setSearch}
        includeVoided={includeVoided} onIncludeVoidedChange={setIncludeVoided}
      />

      <DVTable
        data={filtered}
        sortField={sortField} sortDir={sortDir} onSortChange={handleSort}
        page={page} pageSize={pageSize}
        onPageChange={setPage} onPageSizeChange={setPageSize}
        onView={setViewingDV}
        onReprint={handleReprint}
        onVoid={setVoidingDV}
        onConfirm={handleConfirm}
        onPrint={handleReprint}
        isLoading={loading}
      />
      {hiddenVoidedHint && (
        <div className="mt-2 text-center text-[12px] text-muted-foreground">
          {summary.voidedCount} voided voucher{summary.voidedCount !== 1 ? "s" : ""} hidden.{" "}
          <button
            type="button"
            onClick={() => setIncludeVoided(true)}
            className="text-primary hover:underline"
          >
            Include voided
          </button>
          {" "}to show them.
        </div>
      )}

      <VoidDialog
        open={voidingDV !== null}
        dvNumber={voidingDV?.dvNumber ?? ""}
        onClose={() => setVoidingDV(null)}
        onConfirm={handleVoidConfirm}
      />

      <VoucherDetailModal
        open={viewingDV !== null}
        dvId={viewingDV?.id ?? null}
        token={token ?? ""}
        locationId={locationId ?? ""}
        onClose={() => setViewingDV(null)}
        onReprint={handleReprint}
        onVoid={(dv) => { setViewingDV(null); setVoidingDV(dv); }}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
