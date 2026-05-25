"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle, Copy, FileText, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtPeso, fmtDate } from "@/lib/format";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import { buildDisbursementVoucherHtml } from "@/lib/disbursement-voucher-html";
import { FinancialActionSummary } from "@/components/financial-action-summary";

/* ── Types ── */

interface DeductionLine {
  deductionType: string;
  description: string;
  referenceNumber: string;
  amount: string;
}

interface AdditionalChargeLine {
  chargeType: string;
  description: string;
  referenceNumber: string;
  amount: string;
}

interface PaymentLine {
  paymentMethod: string;
  amount: string;
  referenceNumber: string;
  bankName: string;
  transactionDate: string;
  platform: string;
  receivedBy: string;
}

interface SupplierPaymentProfile {
  id: string;
  name: string;
  paymentTermsDays: number;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountName: string | null;
}

interface PendingSupplierReturn {
  id: string;
  rtvNo: string;
  status: string;
  lineCount: number;
  totalCost: string;
  locationName: string | null;
}

const EMPTY_DEDUCTION: DeductionLine = {
  deductionType: "EWT", description: "", referenceNumber: "", amount: "",
};
const EMPTY_CHARGE: AdditionalChargeLine = {
  chargeType: "FREIGHT", description: "", referenceNumber: "", amount: "",
};
const EMPTY_PAYMENT: PaymentLine = {
  paymentMethod: "CHECK", amount: "", referenceNumber: "", bankName: "",
  transactionDate: "", platform: "", receivedBy: "",
};

const DEDUCTION_TYPES = [
  { value: "EWT", label: "EWT" },
  { value: "CREDIT_MEMO", label: "Credit Memo" },
  { value: "RETURN", label: "Return" },
  { value: "OTHER", label: "Other" },
];
const CHARGE_TYPES = [
  { value: "FREIGHT", label: "Freight" },
  { value: "HANDLING", label: "Handling" },
  { value: "MISCELLANEOUS", label: "Miscellaneous" },
  { value: "ADJUSTMENT", label: "Adjustment" },
  { value: "OTHER", label: "Other" },
];
const METHOD_OPTIONS = [
  { value: "CHECK", label: "Check" },
  { value: "CASH", label: "Cash" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "ONLINE", label: "Online" },
];

function paymentLineWarnings(payment: PaymentLine): string[] {
  const warnings: string[] = [];
  if ((parseFloat(payment.amount) || 0) <= 0) warnings.push("Amount is missing.");

  if (payment.paymentMethod === "CHECK") {
    if (!payment.referenceNumber.trim()) warnings.push("Check number is missing.");
    if (!payment.bankName.trim()) warnings.push("Bank is missing.");
    if (!payment.transactionDate) warnings.push("Check date is missing.");
  }

  if (payment.paymentMethod === "BANK_TRANSFER") {
    if (!payment.referenceNumber.trim()) warnings.push("Transfer reference is missing.");
    if (!payment.bankName.trim()) warnings.push("Bank is missing.");
    if (!payment.transactionDate) warnings.push("Transfer date is missing.");
  }

  if (payment.paymentMethod === "ONLINE") {
    if (!payment.referenceNumber.trim()) warnings.push("Transaction ID is missing.");
    if (!payment.platform.trim()) warnings.push("Platform is missing.");
    if (!payment.transactionDate) warnings.push("Transaction date is missing.");
  }

  if (payment.paymentMethod === "CASH" && !payment.receivedBy.trim()) {
    warnings.push("Receiver name is missing.");
  }

  return warnings;
}

function pendingReturnStatusLabel(status: string): string {
  if (status === "SUBMITTED") return "Submitted - stock deducted";
  if (status === "ACKNOWLEDGED") return "Acknowledged - awaiting credit";
  return status.replace(/_/g, " ");
}

/* ── Page ── */

export default function NewDisbursementVoucherPage() {
  const { token, locationId, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useSearchParams() ?? new URLSearchParams();
  const soaIdParam = params.get("soaId");
  const soaIdsParam = params.get("soaIds"); // comma-separated, from multi-SOA selection
  const supplierIdParam = params.get("supplierId");
  const explicitRtvIdKey = params.get("rtvIds") || "";
  const explicitRtvIds = useMemo(
    () => new Set(explicitRtvIdKey.split(",").map((id) => id.trim()).filter(Boolean)),
    [explicitRtvIdKey],
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [soaData, setSoaData] = useState<{
    id: string; soaNumber: string; supplierName: string; supplierId: string;
    dateFrom: string; dateTo: string; totalBalance: number;
  } | null>(null);

  // Multi-SOA data (when soaIds param present)
  const [multiSoaData, setMultiSoaData] = useState<Array<{
    id: string; soaNumber: string; supplierName: string; supplierId: string;
    totalAmount: number; totalBalance: number;
  }>>([]);
  const isMultiSOA = multiSoaData.length > 1;

  const [supplierId, setSupplierId] = useState(supplierIdParam ?? "");
  const [grossAmount, setGrossAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [remarks, setRemarks] = useState("");
  const [deductions, setDeductions] = useState<DeductionLine[]>([]);
  const [charges, setCharges] = useState<AdditionalChargeLine[]>([]);
  const [payments, setPayments] = useState<PaymentLine[]>([{ ...EMPTY_PAYMENT }]);
  const [supplierProfile, setSupplierProfile] = useState<SupplierPaymentProfile | null>(null);
  const [pendingReturns, setPendingReturns] = useState<PendingSupplierReturn[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [pendingPaymentReview, setPendingPaymentReview] = useState<"draft" | "print" | null>(null);

  // Credit memos available for this supplier
  const [availableCMs, setAvailableCMs] = useState<Array<{ id: string; invoiceNumber: string; invoiceDate: string; totalAmount: number }>>([]);
  const [selectedCMIds, setSelectedCMIds] = useState<Set<string>>(new Set());

  // Derived amounts
  const gross = parseFloat(grossAmount) || 0;
  const grossLockedToSoa = Boolean(soaData || multiSoaData.length > 0);
  const totalDed = useMemo(() => deductions.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0), [deductions]);
  const totalCharges = useMemo(() => charges.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0), [charges]);
  const totalCMs = useMemo(() =>
    availableCMs.filter((cm) => selectedCMIds.has(cm.id)).reduce((s, cm) => s + Math.abs(cm.totalAmount), 0),
    [availableCMs, selectedCMIds],
  );
  const selectedCreditMemos = useMemo(
    () => availableCMs.filter((cm) => selectedCMIds.has(cm.id)),
    [availableCMs, selectedCMIds],
  );
  const pendingReturnTotal = useMemo(
    () => pendingReturns.reduce((sum, rtv) => sum + (parseFloat(rtv.totalCost) || 0), 0),
    [pendingReturns],
  );
  const netAmount = gross + totalCharges - totalDed - totalCMs;
  const chargeTypeSummary = useMemo(() => {
    const labels = charges
      .filter((c) => parseFloat(c.amount) > 0)
      .map((c) => CHARGE_TYPES.find((t) => t.value === c.chargeType)?.label ?? c.chargeType);
    return Array.from(new Set(labels)).join(", ");
  }, [charges]);
  const payTotal = useMemo(() => payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0), [payments]);
  const payMismatch = payments.length > 0 && netAmount > 0 && Math.abs(payTotal - netAmount) > 0.01;
  const paymentWarnings = useMemo(() => payments.map(paymentLineWarnings), [payments]);
  const paymentWarningCount = useMemo(
    () => paymentWarnings.reduce((sum, warnings) => sum + warnings.length, 0),
    [paymentWarnings],
  );
  // Charges with an amount but no description would be silently dropped by the API (Zod requires min(1) description),
  // which then breaks the payment-lines-equal-net check. Surface it inline and block submit instead.
  const chargeErrorIdxs = useMemo(() => {
    const s = new Set<number>();
    charges.forEach((c, i) => {
      if ((parseFloat(c.amount) || 0) > 0 && c.description.trim().length === 0) s.add(i);
    });
    return s;
  }, [charges]);
  const hasChargeError = chargeErrorIdxs.size > 0;

  // Fetch SOA(s) — handles both single soaId and multi soaIds
  const fetchSOA = useCallback(async () => {
    if (!token || !locationId) { setLoading(false); return; }

    // Multi-SOA mode: fetch all SOAs from comma-separated IDs
    const soaIdList = soaIdsParam ? soaIdsParam.split(",").filter(Boolean) : soaIdParam ? [soaIdParam] : [];
    if (soaIdList.length === 0) { setLoading(false); return; }

    try {
      let resolvedSupplierId = supplierIdParam || "";
      if (soaIdList.length > 1) {
        // Multi-SOA: fetch each SOA's history entry for balance data
        const histRes = await apiFetch<{ data: any[] }>(`/ap/supplier-soa/history?limit=200`, { token, locationId });
        const allHist = histRes.data || [];
        const matched = soaIdList.map((id) => allHist.find((h: any) => h.id === id)).filter(Boolean);
        if (matched.length === 0) { setError("Selected SOAs not found"); setLoading(false); return; }

        const soaItems = matched.map((h: any) => ({
          id: h.id, soaNumber: h.soaNumber, supplierName: h.supplierName,
          supplierId: h.supplierId, totalAmount: h.totalAmount, totalBalance: h.totalBalance,
        }));
        setMultiSoaData(soaItems);

        const sid = soaItems[0].supplierId;
        resolvedSupplierId = sid;
        setSupplierId(sid);
        const totalBal = soaItems.reduce((s: number, x: any) => s + x.totalBalance, 0);
        setGrossAmount(String(totalBal.toFixed(2)));
        setPayments([{ ...EMPTY_PAYMENT, amount: String(totalBal.toFixed(2)) }]);

        // Set soaData to the first SOA for header display
        const firstSnap = await apiFetch<any>(`/ap/supplier-soa/${soaIdList[0]}`, { token, locationId });
        setSoaData({
          id: soaIdList[0], soaNumber: `${soaItems.length} SOAs`, supplierName: soaItems[0].supplierName,
          supplierId: sid, dateFrom: firstSnap.dateFrom, dateTo: firstSnap.dateTo, totalBalance: totalBal,
        });
      } else {
        // Single SOA mode (existing behavior)
        const snap = await apiFetch<any>(`/ap/supplier-soa/${soaIdList[0]}`, { token, locationId });
        const histRes = await apiFetch<any>(`/ap/supplier-soa/history?search=${encodeURIComponent(snap.soaNumber)}&limit=1`, { token, locationId });
        const bal = histRes.data?.[0]?.totalBalance ?? 0;
        setSoaData({
          id: soaIdList[0], soaNumber: snap.soaNumber, supplierName: snap.supplier?.name ?? "",
          supplierId: snap.supplierId ?? supplierIdParam ?? "", dateFrom: snap.dateFrom, dateTo: snap.dateTo,
          totalBalance: bal,
        });
        const sid = snap.supplierId ?? supplierIdParam ?? "";
        resolvedSupplierId = sid;
        setSupplierId(sid);
        setGrossAmount(String(bal));
        setPayments([{ ...EMPTY_PAYMENT, amount: String(bal) }]);
      }

      // Fetch available credit memos for this supplier
      const sid = resolvedSupplierId;
      if (sid) {
        try {
          const cmRes = await apiFetch<{ data: any[] }>(
            `/ap/invoices?supplierId=${sid}&status=OPEN,PAID&limit=100`,
            { token, locationId },
          );
          const cms = (cmRes.data || [])
            .filter((inv: any) => inv.invoiceNumber?.startsWith("CM-") && parseFloat(inv.totalAmount) < 0 && !inv.billed)
            .map((inv: any) => ({
              id: inv.id, invoiceNumber: inv.invoiceNumber, invoiceDate: inv.invoiceDate,
              totalAmount: parseFloat(inv.totalAmount),
            }));
          setAvailableCMs(cms);
        } catch {} // Silent — CMs are optional
      }
    } catch { setError("Failed to load SOA data"); } finally { setLoading(false); }
  }, [token, locationId, soaIdParam, soaIdsParam, supplierIdParam]);

  useEffect(() => { if (!authLoading) fetchSOA(); }, [authLoading, fetchSOA]);

  useEffect(() => {
    if (!token || !locationId || !supplierId) {
      setSupplierProfile(null);
      setPendingReturns([]);
      setProfileLoading(false);
      return;
    }
    let cancelled = false;
    setProfileLoading(true);
    Promise.all([
      apiFetch<SupplierPaymentProfile>(`/ap/suppliers/${supplierId}`, { token, locationId }).catch(() => null),
      apiFetch<{ data: PendingSupplierReturn[] }>(
        `/procurement/supplier-returns?status=SUBMITTED,ACKNOWLEDGED&supplierId=${supplierId}&allLocations=true&limit=100`,
        { token, locationId },
      ).catch(() => ({ data: [] })),
    ])
      .then(([detail, pendingRes]) => {
        if (cancelled) return;
        setSupplierProfile(detail);
        setPendingReturns(Array.isArray(pendingRes.data) ? pendingRes.data : []);
      })
      .catch(() => {
        if (!cancelled) {
          setSupplierProfile(null);
          setPendingReturns([]);
        }
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, locationId, supplierId]);

  useEffect(() => {
    if (explicitRtvIds.size === 0 || pendingReturns.length === 0) return;
    setDeductions((prev) => {
      const existingRefs = new Set(
        prev.filter((d) => d.deductionType === "RETURN").map((d) => d.referenceNumber),
      );
      const additions = pendingReturns
        .filter((rtv) => explicitRtvIds.has(rtv.id) && !existingRefs.has(rtv.rtvNo))
        .map((rtv) => ({
          deductionType: "RETURN",
          description: `RTV deduction ${rtv.rtvNo}`,
          referenceNumber: rtv.rtvNo,
          amount: String(parseFloat(rtv.totalCost || "0").toFixed(2)),
        }));
      return additions.length > 0 ? [...prev, ...additions] : prev;
    });
  }, [explicitRtvIds, pendingReturns]);

  // Auto-update first payment amount when net changes
  useEffect(() => {
    if (payments.length === 1 && netAmount > 0) {
      setPayments((prev) => [{ ...prev[0], amount: String(netAmount.toFixed(2)) }]);
    }
  }, [netAmount]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deduction helpers
  const updateDed = (i: number, f: keyof DeductionLine, v: string) => setDeductions((p) => { const n = [...p]; n[i] = { ...n[i], [f]: v }; return n; });
  const addDed = () => setDeductions((p) => [...p, { ...EMPTY_DEDUCTION }]);
  const rmDed = (i: number) => setDeductions((p) => p.filter((_, j) => j !== i));
  const pendingReturnIsIncluded = (rtv: PendingSupplierReturn) =>
    deductions.some((d) => d.deductionType === "RETURN" && d.referenceNumber === rtv.rtvNo);
  const includePendingReturnDeduction = (rtv: PendingSupplierReturn) => {
    if (pendingReturnIsIncluded(rtv)) return;
    setDeductions((prev) => [
      ...prev,
      {
        deductionType: "RETURN",
        description: `RTV deduction ${rtv.rtvNo}`,
        referenceNumber: rtv.rtvNo,
        amount: String(parseFloat(rtv.totalCost || "0").toFixed(2)),
      },
    ]);
  };
  const removePendingReturnDeduction = (rtv: PendingSupplierReturn) => {
    setDeductions((prev) =>
      prev.filter((d) => !(d.deductionType === "RETURN" && d.referenceNumber === rtv.rtvNo)),
    );
  };

  // Charge helpers
  const updateCharge = (i: number, f: keyof AdditionalChargeLine, v: string) => setCharges((p) => { const n = [...p]; n[i] = { ...n[i], [f]: v }; return n; });
  const addCharge = () => setCharges((p) => [...p, { ...EMPTY_CHARGE }]);
  const rmCharge = (i: number) => setCharges((p) => p.filter((_, j) => j !== i));

  // Payment helpers
  const updatePay = (i: number, f: keyof PaymentLine, v: string) => setPayments((p) => { const n = [...p]; n[i] = { ...n[i], [f]: v }; return n; });
  const addPay = () => setPayments((p) => [...p, { ...EMPTY_PAYMENT }]);
  const rmPay = (i: number) => { if (payments.length > 1) setPayments((p) => p.filter((_, j) => j !== i)); };
  const copySupplierProfileField = async (label: string, value: string | null) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(label);
      window.setTimeout(() => setCopiedField(null), 1800);
    } catch {
      setCopiedField(null);
    }
  };
  const applySupplierBankToFirstPayment = () => {
    const bankName = supplierProfile?.bankName?.trim();
    if (!bankName) return;
    setPayments((prev) => {
      const next = prev.length > 0 ? [...prev] : [{ ...EMPTY_PAYMENT }];
      next[0] = {
        ...next[0],
        paymentMethod: next[0].paymentMethod === "CASH" ? "BANK_TRANSFER" : next[0].paymentMethod,
        bankName,
      };
      return next;
    });
  };

  const buildPaymentLines = () => payments.map((p) => ({
    paymentMethod: p.paymentMethod, amount: p.amount,
    referenceNumber: p.referenceNumber || undefined, bankName: p.bankName || undefined,
    transactionDate: p.transactionDate || undefined, platform: p.platform || undefined,
    receivedBy: p.receivedBy || undefined,
  }));

  const buildDeductions = () => {
    const manualDeds = deductions.filter((d) => parseFloat(d.amount) > 0).map((d) => ({
      deductionType: d.deductionType, description: d.description,
      referenceNumber: d.referenceNumber || undefined, amount: d.amount,
    }));
    const cmDeds = selectedCreditMemos.map((cm) => ({
      deductionType: "CREDIT_MEMO", description: cm.invoiceNumber,
      referenceNumber: cm.id, amount: String(Math.abs(cm.totalAmount).toFixed(2)),
    }));
    return [...manualDeds, ...cmDeds];
  };

  const buildCharges = () =>
    charges
      .filter((c) => c.description.trim().length > 0 && parseFloat(c.amount) > 0)
      .map((c) => ({
        chargeType: c.chargeType,
        description: c.description.trim(),
        referenceNumber: c.referenceNumber.trim() || undefined,
        amount: String(parseFloat(c.amount).toFixed(2)),
      }));

  const buildBody = (soaId?: string, soaGross?: string) => {
    // Send soaId for the explicit-singular path; ALSO send soaIds whenever the
    // URL has any (parsed from ?soaIds= comma-csv OR singular ?soaId=). Without
    // the soaIds branch, a single SOA arriving via the plural URL param (e.g.
    // soa-history's "Pay Selected" with one SOA ticked) would lose its linkage
    // and the 65c970d server guard would correctly reject the orphan payload.
    // Server resolves soaIds-first per service.ts:2204, so sending both is safe.
    const explicitSingle = soaId || soaIdParam;
    const urlSoaIds = soaIdsParam
      ? soaIdsParam.split(",").filter(Boolean)
      : soaIdParam ? [soaIdParam] : [];
    return {
      supplierId,
      ...(explicitSingle ? { soaId: explicitSingle } : {}),
      ...(urlSoaIds.length > 0 ? { soaIds: urlSoaIds } : {}),
      grossAmount: soaGross || grossAmount,
      paymentDate, remarks: remarks || undefined,
      deductions: buildDeductions(),
      additionalCharges: buildCharges(),
      payments: buildPaymentLines(),
    };
  };

  // For multi-SOA: create ONE DV linked to all selected SOAs via junction table
  const handleMultiSave = async (andPrint: boolean) => {
    if (hasChargeError) { setError("Additional charges with an amount must have a description."); return; }
    setSaving(true); setError(null);
    try {
      const body = {
        supplierId,
        soaIds: multiSoaData.map((s) => s.id),
        grossAmount,
        paymentDate,
        remarks: remarks || undefined,
        deductions: buildDeductions(),
        additionalCharges: buildCharges(),
        payments: buildPaymentLines(),
      };

      const res = await apiFetch<{ id: string; dvNumber: string }>("/ap/disbursement-vouchers", {
        token, locationId, method: "POST", body: JSON.stringify(body),
      });

      if (andPrint) {
        await apiFetch(`/ap/disbursement-vouchers/${res.id}/print`, { token, locationId, method: "POST" });
      }
      router.push("/ap/disbursement-vouchers");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      setError(msg);
      setSaving(false);
    }
  };

  const handleSaveDraft = async (skipPaymentReview = false) => {
    if (!skipPaymentReview && paymentWarningCount > 0) {
      setPendingPaymentReview("draft");
      return;
    }
    if (hasChargeError) { setError("Additional charges with an amount must have a description."); return; }
    if (isMultiSOA) { await handleMultiSave(false); return; }
    setSaving(true); setError(null);
    try {
      await apiFetch("/ap/disbursement-vouchers", { token, locationId, method: "POST", body: JSON.stringify(buildBody()) });
      router.push("/ap/disbursement-vouchers");
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Failed to save"); setSaving(false); }
  };

  const handleSaveAndPrint = async (skipPaymentReview = false) => {
    if (!skipPaymentReview && paymentWarningCount > 0) {
      setPendingPaymentReview("print");
      return;
    }
    if (hasChargeError) { setError("Additional charges with an amount must have a description."); return; }
    if (isMultiSOA) { await handleMultiSave(true); return; }
    setSaving(true); setError(null);
    try {
      const res = await apiFetch<{ id: string; dvNumber: string }>("/ap/disbursement-vouchers", { token, locationId, method: "POST", body: JSON.stringify(buildBody()) });
      await apiFetch(`/ap/disbursement-vouchers/${res.id}/print`, { token, locationId, method: "POST" });
      const allDedsPrint = [
        ...deductions.filter((d) => parseFloat(d.amount) > 0).map((d) => ({
          description: d.description, amount: parseFloat(d.amount),
        })),
        ...selectedCreditMemos.map((cm) => ({
          description: cm.invoiceNumber, amount: Math.abs(cm.totalAmount),
        })),
      ];
      const chargesPrint = charges
        .filter((c) => c.description.trim().length > 0 && parseFloat(c.amount) > 0)
        .map((c) => ({
          chargeType: c.chargeType,
          description: c.description.trim(),
          referenceNumber: c.referenceNumber.trim() || null,
          amount: parseFloat(c.amount),
        }));
      const html = buildDisbursementVoucherHtml({
        dvNumber: res.dvNumber, supplierName: soaData?.supplierName ?? "", amount: netAmount,
        grossAmount: gross, totalDeductions: totalDed + totalCMs, paymentDate,
        soaNumber: soaData?.soaNumber, soaDateFrom: soaData?.dateFrom, soaDateTo: soaData?.dateTo,
        remarks: remarks || null,
        deductions: allDedsPrint,
        additionalCharges: chargesPrint,
        payments: payments.map((p) => ({
          paymentMethod: p.paymentMethod, amount: parseFloat(p.amount) || 0,
          referenceNumber: p.referenceNumber || null, bankName: p.bankName || null,
          transactionDate: p.transactionDate || null, platform: p.platform || null,
        })),
      });
      const w = window.open("", "_blank");
      if (w) { w.document.write(html); w.document.close(); w.onload = () => w.print(); }
      router.push("/ap/disbursement-vouchers");
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Failed to save"); setSaving(false); }
  };

  if (authLoading || loading) return <div className="flex items-center justify-center py-20"><div className="text-sm text-muted-foreground">Loading...</div></div>;

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col">
      {/* Header */}
      <div className="mb-5 flex items-center gap-3">
        <button onClick={() => router.back()} className="rounded-lg p-1.5 hover:bg-muted"><ArrowLeft size={16} /></button>
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]"><FileText size={16} className="text-primary" /></div>
          <div>
            <h1 className="text-[18px] font-semibold tracking-tight">New Disbursement Voucher</h1>
            <p className="text-[13px] text-muted-foreground">{soaData ? `For ${soaData.soaNumber} — ${soaData.supplierName}` : "Create a disbursement voucher"}</p>
          </div>
        </div>
      </div>

      {error && <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">{error}</div>}

      <div className="space-y-4 rounded-xl border border-border bg-background p-5 shadow-sm">
        {/* No-SOA notice — blocks the orphan-DV input shape that produced
         * DV-2026-000026 and DV-2026-000027. The server also rejects empty
         * soaIds (DV_REQUIRES_SOA), so this is a UX guard, not a security
         * boundary. Users must reach this page via Supplier SOA History →
         * Pay (single SOA) or the multi-SOA selection flow. */}
        {!soaData && !isMultiSOA && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="font-semibold mb-1">No SOA selected</div>
            <p>A disbursement voucher must be linked to at least one SOA. Open the <a href="/ap/supplier-soa" className="underline font-medium">Supplier SOA History</a> page and click <strong>Pay</strong> on the SOA(s) you want to settle.</p>
          </div>
        )}

        {/* SOA info */}
        {soaData && !isMultiSOA && (
          <div className="rounded-lg border border-primary/20 bg-primary/[0.03] p-4 space-y-1 text-sm">
            <div><span className="text-muted-foreground">Supplier:</span> <span className="font-medium">{soaData.supplierName}</span></div>
            <div><span className="text-muted-foreground">SOA:</span> <span className="font-mono font-semibold">{soaData.soaNumber}</span></div>
            <div><span className="text-muted-foreground">Period:</span> {fmtDate(soaData.dateFrom)} – {fmtDate(soaData.dateTo)}</div>
            <div className="text-lg font-bold tabular-nums">SOA Amount: {fmtPeso(soaData.totalBalance)}</div>
          </div>
        )}

        {/* Multi-SOA breakdown */}
        {isMultiSOA && (
          <div className="rounded-lg border border-primary/20 bg-primary/[0.03] p-4 space-y-3">
            <div className="text-sm">
              <span className="text-muted-foreground">Supplier:</span>{" "}
              <span className="font-medium">{multiSoaData[0]?.supplierName}</span>
            </div>
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              {multiSoaData.length} SOAs — one DV will be created per SOA
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-[12px]">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">SOA #</th>
                    <th className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Amount</th>
                    <th className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {multiSoaData.map((s) => (
                    <tr key={s.id} className="border-t border-border/40">
                      <td className="px-3 py-1.5 font-mono font-semibold">{s.soaNumber}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{fmtPeso(s.totalAmount)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{fmtPeso(s.totalBalance)}</td>
                    </tr>
                  ))}
                  <tr className="bg-muted/20 font-semibold">
                    <td className="px-3 py-1.5">Total</td>
                    <td className="px-3 py-1.5" />
                    <td className="px-3 py-1.5 text-right tabular-nums text-lg">{fmtPeso(multiSoaData.reduce((s, x) => s + x.totalBalance, 0))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {saving && saveProgress > 0 && (
              <div className="text-[11px] text-muted-foreground">
                Creating DV {saveProgress} of {multiSoaData.length}...
              </div>
            )}
          </div>
        )}

        {pendingReturns.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-semibold">Pending supplier returns before payment</div>
                <p className="mt-1 text-[12px]">
                  {pendingReturns.length} submitted/acknowledged RTV{pendingReturns.length !== 1 ? "s" : ""} worth {fmtPeso(pendingReturnTotal)} may be for supplier deduction. Confirm the credit memo or add a Return/Credit Memo deduction before releasing payment.
                </p>
              </div>
              <span className="rounded-md bg-background/80 px-2 py-1 text-[11px] font-semibold">
                Not auto-deducted
              </span>
            </div>
            <div className="mt-3 overflow-hidden rounded-lg border border-amber-200 bg-background/80">
              {pendingReturns.slice(0, 5).map((rtv) => (
                <div
                  key={rtv.id}
                  className="grid w-full grid-cols-[120px_1fr_90px_100px_120px] gap-2 border-b border-amber-100 px-3 py-2 text-left text-[12px] last:border-b-0 hover:bg-amber-100/50"
                >
                  <button
                    type="button"
                    onClick={() => router.push(`/procurement/supplier-returns/${rtv.id}`)}
                    className="text-left font-mono font-semibold text-primary hover:underline"
                  >
                    {rtv.rtvNo}
                  </button>
                  <span className="truncate">{pendingReturnStatusLabel(rtv.status)}</span>
                  <span className="text-right text-muted-foreground">{rtv.lineCount} item{rtv.lineCount !== 1 ? "s" : ""}</span>
                  <span className="text-right font-semibold tabular-nums">{fmtPeso(rtv.totalCost)}</span>
                  {pendingReturnIsIncluded(rtv) ? (
                    <button
                      type="button"
                      onClick={() => removePendingReturnDeduction(rtv)}
                      className="rounded-md border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-amber-900 hover:bg-amber-100"
                    >
                      Remove deduction
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => includePendingReturnDeduction(rtv)}
                      className="rounded-md bg-amber-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-amber-700"
                    >
                      Include deduction
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Supplier payment profile */}
        {supplierId && (
          <SupplierPaymentProfileCard
            profile={supplierProfile}
            loading={profileLoading}
            copiedField={copiedField}
            onCopy={copySupplierProfileField}
            onApplyBank={applySupplierBankToFirstPayment}
          />
        )}

        {/* Payment Date + Gross */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Payment Date</label>
            <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)}
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">SOA Amount (Gross)</label>
            <input type="number" step="0.01" value={grossAmount} onChange={(e) => setGrossAmount(e.target.value)} readOnly={grossLockedToSoa}
              className={`h-9 w-full rounded-lg border border-border px-3 text-sm tabular-nums outline-none focus:border-primary ${grossLockedToSoa ? "bg-muted/40 text-muted-foreground" : "bg-background"}`} />
            {grossLockedToSoa && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Locked to the full SOA balance. Use deductions or credit memos to reduce the net payment.
              </p>
            )}
          </div>
        </div>

        {/* ── Deductions ── */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">Deductions</label>
            <button onClick={addDed} className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/10">
              <Plus size={12} /> Add Deduction
            </button>
          </div>
          {deductions.length === 0 ? (
            <p className="text-[11px] text-muted-foreground italic">No deductions — full SOA amount will be disbursed</p>
          ) : (
            <div className="space-y-2">
              {deductions.map((d, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 p-2">
                  <select value={d.deductionType} onChange={(e) => {
                      updateDed(i, "deductionType", e.target.value);
                      // Reset EWT fields when switching away
                      if (e.target.value !== "EWT") { updateDed(i, "description", ""); updateDed(i, "amount", ""); }
                    }}
                    className="h-8 w-32 rounded border border-border bg-background px-2 text-[12px] outline-none">
                    {DEDUCTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  {d.deductionType === "EWT" ? (
                    <select value={d.description} onChange={(e) => {
                        updateDed(i, "description", e.target.value);
                        const rateMap: Record<string, number> = {
                          "EWT 1% - Goods": 0.01, "EWT 2% - Services": 0.02,
                          "EWT 5% - Rentals": 0.05, "EWT 10% - Professional (Individual)": 0.10,
                          "EWT 15% - Professional (Corporate)": 0.15,
                        };
                        const rate = rateMap[e.target.value];
                        const soaBase = (soaData?.totalBalance ?? gross) / 1.12;
                        if (rate && soaBase > 0) updateDed(i, "amount", (soaBase * rate).toFixed(2));
                      }}
                      className="h-8 flex-1 rounded border border-border bg-background px-2 text-[12px] outline-none">
                      <option value="">Select EWT rate...</option>
                      <option value="EWT 1% - Goods">1% - Goods</option>
                      <option value="EWT 2% - Services">2% - Services</option>
                      <option value="EWT 5% - Rentals">5% - Rentals</option>
                      <option value="EWT 10% - Professional (Individual)">10% - Professional (Individual)</option>
                      <option value="EWT 15% - Professional (Corporate)">15% - Professional (Corporate)</option>
                    </select>
                  ) : (
                    <input type="text" value={d.description} onChange={(e) => updateDed(i, "description", e.target.value)}
                      placeholder="Description" className="h-8 flex-1 rounded border border-border bg-background px-2 text-[12px] outline-none focus:border-primary" />
                  )}
                  <input type="text" value={d.referenceNumber} onChange={(e) => updateDed(i, "referenceNumber", e.target.value)}
                    placeholder="Ref #" className="h-8 w-24 rounded border border-border bg-background px-2 text-[12px] outline-none focus:border-primary" />
                  <input type="number" step="0.01" value={d.amount} onChange={(e) => updateDed(i, "amount", e.target.value)}
                    placeholder="Amount" className="h-8 w-28 rounded border border-border bg-background px-2 text-[12px] tabular-nums outline-none focus:border-primary" />
                  <button onClick={() => rmDed(i)} className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Additional Charges ── */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">Additional Charges</label>
            <button onClick={addCharge} className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/10">
              <Plus size={12} /> Add Charge
            </button>
          </div>
          {charges.length === 0 ? (
            <p className="text-[11px] text-muted-foreground italic">No additional charges — freight, handling, and misc fees would add to the net payment</p>
          ) : (
            <div className="space-y-2">
              {charges.map((c, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 p-2">
                  <select value={c.chargeType} onChange={(e) => updateCharge(i, "chargeType", e.target.value)}
                    className="h-8 w-32 rounded border border-border bg-background px-2 text-[12px] outline-none">
                    {CHARGE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <input type="text" value={c.description} onChange={(e) => updateCharge(i, "description", e.target.value)}
                    placeholder={chargeErrorIdxs.has(i) ? "Description required" : "Description / Reference"}
                    aria-invalid={chargeErrorIdxs.has(i) || undefined}
                    className={cn(
                      "h-8 flex-1 rounded border bg-background px-2 text-[12px] outline-none focus:border-primary",
                      chargeErrorIdxs.has(i)
                        ? "border-destructive/60 placeholder:text-destructive/70"
                        : "border-border",
                    )} />
                  <input type="text" value={c.referenceNumber} onChange={(e) => updateCharge(i, "referenceNumber", e.target.value)}
                    placeholder="Ref #" className="h-8 w-24 rounded border border-border bg-background px-2 text-[12px] outline-none focus:border-primary" />
                  <input type="number" step="0.01" value={c.amount} onChange={(e) => updateCharge(i, "amount", e.target.value)}
                    placeholder="Amount" className="h-8 w-28 rounded border border-border bg-background px-2 text-[12px] tabular-nums outline-none focus:border-primary" />
                  <button onClick={() => rmCharge(i)} className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Credit Memos ── */}
        {availableCMs.length > 0 && (
          <div>
            <label className="mb-2 block text-xs font-medium text-muted-foreground">
              Available Credit Memos
            </label>
            <div className="space-y-1">
              {availableCMs.map((cm) => (
                <label
                  key={cm.id}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-2 cursor-pointer transition-colors",
                    selectedCMIds.has(cm.id)
                      ? "border-primary/30 bg-primary/[0.03]"
                      : "border-border hover:bg-muted/30",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selectedCMIds.has(cm.id)}
                    onChange={() => {
                      setSelectedCMIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(cm.id)) next.delete(cm.id); else next.add(cm.id);
                        return next;
                      });
                    }}
                    className="accent-primary"
                  />
                  <span className="font-mono text-[12px] font-semibold">{cm.invoiceNumber}</span>
                  <span className="text-[11px] text-muted-foreground">{fmtDate(cm.invoiceDate)}</span>
                  <span className="ml-auto text-[12px] tabular-nums font-semibold text-red-600">
                    ({fmtPeso(Math.abs(cm.totalAmount))})
                  </span>
                </label>
              ))}
            </div>
            {totalCMs > 0 && (
              <div className="mt-1 text-right text-[11px] tabular-nums text-red-600 font-semibold">
                Selected CMs: ({fmtPeso(totalCMs)})
              </div>
            )}
          </div>
        )}

        {(soaData || multiSoaData.length > 0 || selectedCreditMemos.length > 0) && (
          <div className="rounded-lg border border-primary/20 bg-primary/[0.025] p-3 text-[12px]">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-semibold text-foreground">DV funding trail</span>
              <span className="text-[11px] text-muted-foreground">Gross - credits/deductions + charges = net payment</span>
            </div>
            <div className="space-y-1">
              {(isMultiSOA ? multiSoaData : soaData ? [soaData] : []).map((soa) => (
                <div key={soa.id} className="flex justify-between gap-3">
                  <span className="font-mono font-semibold">{soa.soaNumber}</span>
                  <span className="tabular-nums">{fmtPeso(soa.totalBalance)}</span>
                </div>
              ))}
              {selectedCreditMemos.map((cm) => (
                <div key={cm.id} className="flex justify-between gap-3 text-emerald-700">
                  <span className="font-mono font-semibold">Credit {cm.invoiceNumber}</span>
                  <span className="tabular-nums">({fmtPeso(Math.abs(cm.totalAmount))})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <FinancialActionSummary
          className="bg-muted/30 text-sm tabular-nums"
          grossLabel="SOA Amount"
          grossAmount={gross}
          lines={[
            ...(totalCharges > 0 ? [{
              label: `Additional Charges${chargeTypeSummary ? ` (${chargeTypeSummary})` : ""}`,
              amount: totalCharges,
              tone: "charge" as const,
            }] : []),
            ...(totalDed > 0 ? [{
              label: "Deductions (EWT)",
              amount: totalDed,
              tone: "deduction" as const,
            }] : []),
            ...(totalCMs > 0 ? [{
              label: "Credit Memos",
              amount: totalCMs,
              tone: "credit" as const,
            }] : []),
          ]}
          netLabel="Net Payment"
          netAmount={netAmount}
          netTone="neutral"
        />

        {/* ── Payments ── */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">Payment Details</label>
            <button onClick={addPay} className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/10">
              <Plus size={12} /> Add Payment
            </button>
          </div>
          <div className="space-y-2">
            {payments.map((p, idx) => {
              const warnings = paymentWarnings[idx] ?? [];
              return (
              <div key={idx} className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <select value={p.paymentMethod} onChange={(e) => updatePay(idx, "paymentMethod", e.target.value)}
                    className="h-8 rounded-lg border border-border bg-background px-2 text-[12px] outline-none">
                    {METHOD_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                  <input type="number" step="0.01" value={p.amount} onChange={(e) => updatePay(idx, "amount", e.target.value)}
                    placeholder="Amount" className="h-8 w-36 rounded-lg border border-border bg-background px-2 text-[12px] tabular-nums outline-none focus:border-primary" />
                  {payments.length > 1 && <button onClick={() => rmPay(idx)} className="ml-auto rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {p.paymentMethod === "CHECK" && (<>
                    <div><label className="mb-0.5 block text-[10px] text-muted-foreground">Check Number</label>
                      <input type="text" value={p.referenceNumber} onChange={(e) => updatePay(idx, "referenceNumber", e.target.value)} className="h-8 w-full rounded border border-border bg-background px-2 text-[12px] outline-none focus:border-primary" /></div>
                    <div><label className="mb-0.5 block text-[10px] text-muted-foreground">Bank</label>
                      <input type="text" value={p.bankName} onChange={(e) => updatePay(idx, "bankName", e.target.value)} className="h-8 w-full rounded border border-border bg-background px-2 text-[12px] outline-none focus:border-primary" /></div>
                    <div><label className="mb-0.5 block text-[10px] text-muted-foreground">Check Date</label>
                      <input type="date" value={p.transactionDate} onChange={(e) => updatePay(idx, "transactionDate", e.target.value)} className="h-8 w-full rounded border border-border bg-background px-2 text-[12px] outline-none focus:border-primary" /></div>
                  </>)}
                  {p.paymentMethod === "BANK_TRANSFER" && (<>
                    <div><label className="mb-0.5 block text-[10px] text-muted-foreground">Reference Number</label>
                      <input type="text" value={p.referenceNumber} onChange={(e) => updatePay(idx, "referenceNumber", e.target.value)} className="h-8 w-full rounded border border-border bg-background px-2 text-[12px] outline-none focus:border-primary" /></div>
                    <div><label className="mb-0.5 block text-[10px] text-muted-foreground">Bank</label>
                      <input type="text" value={p.bankName} onChange={(e) => updatePay(idx, "bankName", e.target.value)} className="h-8 w-full rounded border border-border bg-background px-2 text-[12px] outline-none focus:border-primary" /></div>
                    <div><label className="mb-0.5 block text-[10px] text-muted-foreground">Transfer Date</label>
                      <input type="date" value={p.transactionDate} onChange={(e) => updatePay(idx, "transactionDate", e.target.value)} className="h-8 w-full rounded border border-border bg-background px-2 text-[12px] outline-none focus:border-primary" /></div>
                  </>)}
                  {p.paymentMethod === "ONLINE" && (<>
                    <div><label className="mb-0.5 block text-[10px] text-muted-foreground">Transaction ID</label>
                      <input type="text" value={p.referenceNumber} onChange={(e) => updatePay(idx, "referenceNumber", e.target.value)} className="h-8 w-full rounded border border-border bg-background px-2 text-[12px] outline-none focus:border-primary" /></div>
                    <div><label className="mb-0.5 block text-[10px] text-muted-foreground">Platform</label>
                      <select value={p.platform} onChange={(e) => updatePay(idx, "platform", e.target.value)} className="h-8 w-full rounded border border-border bg-background px-2 text-[12px] outline-none">
                        <option value="">Select...</option><option value="GCash">GCash</option><option value="Maya">Maya</option><option value="PayPal">PayPal</option><option value="Other">Other</option>
                      </select></div>
                    <div><label className="mb-0.5 block text-[10px] text-muted-foreground">Date</label>
                      <input type="date" value={p.transactionDate} onChange={(e) => updatePay(idx, "transactionDate", e.target.value)} className="h-8 w-full rounded border border-border bg-background px-2 text-[12px] outline-none focus:border-primary" /></div>
                  </>)}
                  {p.paymentMethod === "CASH" && (
                    <div><label className="mb-0.5 block text-[10px] text-muted-foreground">Received By</label>
                      <input type="text" value={p.receivedBy} onChange={(e) => updatePay(idx, "receivedBy", e.target.value)} className="h-8 w-full rounded border border-border bg-background px-2 text-[12px] outline-none focus:border-primary" /></div>
                  )}
                </div>
                {warnings.length > 0 && (
                  <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] leading-5 text-amber-800">
                    <span className="font-semibold">Review payment line {idx + 1}:</span>{" "}
                    {warnings.join(" ")}
                  </div>
                )}
              </div>
              );
            })}
          </div>
          {netAmount > 0 && (
            <div className={`mt-1 text-right text-[11px] tabular-nums ${payMismatch ? "text-red-500 font-semibold" : "text-emerald-600"}`}>
              Payment total: {fmtPeso(payTotal)}{payMismatch && ` (must equal net: ${fmtPeso(netAmount)})`}
            </div>
          )}
          {paymentWarningCount > 0 && (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-5 text-amber-800">
              <div className="flex items-start gap-2">
                <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-semibold">Review payment details before saving</div>
                  <div>
                    {paymentWarningCount} missing payment detail{paymentWarningCount !== 1 ? "s" : ""} found. Saving is still allowed, but printed vouchers may be incomplete without references, bank names, dates, or receiver names.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Remarks */}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Remarks (optional)</label>
          <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={() => router.back()} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted">Cancel</button>
          <button onClick={() => handleSaveDraft()} disabled={saving || payMismatch || netAmount <= 0 || hasChargeError || (!soaData && !isMultiSOA)}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">{saving ? "Saving…" : "Save Draft"}</button>
          <button onClick={() => handleSaveAndPrint()} disabled={saving || payMismatch || netAmount <= 0 || hasChargeError || (!soaData && !isMultiSOA)}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{saving ? "Saving…" : "Save & Print"}</button>
        </div>
      </div>

      {pendingPaymentReview && (
        <PaymentReviewDialog
          action={pendingPaymentReview}
          warnings={paymentWarnings}
          onCancel={() => setPendingPaymentReview(null)}
          onContinue={() => {
            const action = pendingPaymentReview;
            setPendingPaymentReview(null);
            if (action === "draft") void handleSaveDraft(true);
            if (action === "print") void handleSaveAndPrint(true);
          }}
        />
      )}
    </div>
  );
}

function termsLabel(days: number): string {
  return days === 0 ? "COD" : `Net ${days}`;
}

function PaymentReviewDialog({
  action,
  onCancel,
  onContinue,
  warnings,
}: {
  action: "draft" | "print";
  onCancel: () => void;
  onContinue: () => void;
  warnings: string[][];
}) {
  const rows = warnings
    .map((messages, index) => ({ index, messages }))
    .filter((row) => row.messages.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-background p-5 shadow-xl">
        <div className="mb-3 flex items-start gap-2 text-amber-700">
          <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />
          <div>
            <h2 className="text-base font-semibold text-foreground">Review payment details</h2>
            <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
              This voucher has incomplete payment references. You can go back and fill them in, or continue if the missing details are intentional.
            </p>
          </div>
        </div>

        <div className="max-h-64 space-y-2 overflow-auto rounded-lg border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-900">
          {rows.map((row) => (
            <div key={row.index}>
              <div className="font-semibold">Payment line {row.index + 1}</div>
              <div className="leading-5">{row.messages.join(" ")}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Go Back
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
          >
            {action === "print" ? "Save & Print Anyway" : "Save Draft Anyway"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SupplierPaymentProfileCard({
  profile,
  loading,
  copiedField,
  onCopy,
  onApplyBank,
}: {
  profile: SupplierPaymentProfile | null;
  loading: boolean;
  copiedField: string | null;
  onCopy: (label: string, value: string | null) => void;
  onApplyBank: () => void;
}) {
  const hasBankDetails = !!(
    profile?.bankName ||
    profile?.bankAccountNumber ||
    profile?.bankAccountName
  );

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-muted/20 p-3 text-[12px] text-muted-foreground">
        Loading supplier payment profile...
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div
      className={cn(
        "rounded-lg border p-4 text-sm",
        hasBankDetails
          ? "border-emerald-200 bg-emerald-50/40"
          : "border-amber-200 bg-amber-50/50",
      )}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 font-semibold text-foreground">
            {hasBankDetails ? (
              <CheckCircle size={14} className="text-emerald-600" />
            ) : (
              <AlertTriangle size={14} className="text-amber-600" />
            )}
            Supplier Payment Profile
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {termsLabel(profile.paymentTermsDays)}
            {hasBankDetails
              ? " - verify these details before releasing payment."
              : " - no saved bank details for this supplier."}
          </p>
        </div>
        {profile.bankName && (
          <button
            type="button"
            onClick={onApplyBank}
            className="rounded-lg border border-emerald-300 bg-background px-3 py-1.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50"
          >
            Use Bank On First Payment
          </button>
        )}
      </div>

      {hasBankDetails ? (
        <div className="grid gap-2 sm:grid-cols-3">
          <SupplierProfileField label="Bank" value={profile.bankName} copiedField={copiedField} onCopy={onCopy} />
          <SupplierProfileField label="Account #" value={profile.bankAccountNumber} copiedField={copiedField} onCopy={onCopy} mono />
          <SupplierProfileField label="Account Name" value={profile.bankAccountName} copiedField={copiedField} onCopy={onCopy} />
        </div>
      ) : (
        <div className="text-[12px] text-amber-800">
          Add bank details in the supplier master record before using bank transfer, or double-check the payment details manually.
        </div>
      )}
    </div>
  );
}

function SupplierProfileField({
  label,
  value,
  copiedField,
  onCopy,
  mono,
}: {
  label: string;
  value: string | null;
  copiedField: string | null;
  onCopy: (label: string, value: string | null) => void;
  mono?: boolean;
}) {
  const isCopied = copiedField === label;
  return (
    <div className="rounded-lg border border-border/70 bg-background px-3 py-2">
      <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span>{label}</span>
        {value && (
          <button
            type="button"
            onClick={() => onCopy(label, value)}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-primary hover:bg-primary/10"
          >
            <Copy size={10} />
            {isCopied ? "Copied" : "Copy"}
          </button>
        )}
      </div>
      <div className={cn("truncate text-[12px] font-medium text-foreground", mono && "font-mono")}>
        {value || "Not saved"}
      </div>
    </div>
  );
}
