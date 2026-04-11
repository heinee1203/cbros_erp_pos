/**
 * Generates a standalone HTML document for the CBROS Consolidated Billing
 * Statement — a single master view summarizing ALL of a customer's SOAs
 * plus a per-payment history table.
 *
 * Design goals:
 *   - Match soa-html.ts styling (CBROS header font, grayscale tables,
 *     signature block footer)
 *   - Fill the entire letter page using a flexbox column layout so the
 *     signature footer always sits at the bottom regardless of content
 *     length, with no empty padding rows on the SOA table
 *
 * Used with window.open() + document.write() for reliable printing.
 */

interface BillingCustomer {
  name: string;
  customerType?: string | null;
  contactPerson?: string | null;
  phone: string;
  email?: string | null;
  address?: string | null;
  paymentTermsDays: number;
  currentBalance?: string | number | null;
}

/**
 * Shape returned by GET /customers/:id/soa/history — see
 * apps/api/src/modules/customers/service.ts listSOARecords().
 */
export interface BillingSOA {
  id: string;
  soaNumber: string;
  dateFrom: string;
  dateTo: string;
  generatedAt?: string;
  totalCharges: number | string;
  totalCredits: number | string;
  totalPayable: number | string;
  paidAmount?: number | string;
  transactionCount?: number;
  status: string;
}

/**
 * One entry in paymentLines JSONB on a PAYMENT customer_transaction.
 * Shape matches what service.ts writes in recordPayment/recordMultiCustomerPayment.
 */
export interface BillingPaymentLine {
  method?: string;
  amount?: number | string;
  reference?: string | null;
  bank?: string | null;
  checkNumber?: string | null;
  checkDate?: string | null;
  cardType?: string | null;
  batchNumber?: string | null;
  traceNumber?: string | null;
  rate?: number | string | null;
  bir2307?: string | null;
}

/**
 * Shape returned by GET /customers/:id/transactions?type=PAYMENT — see
 * apps/api/src/modules/customers/service.ts listTransactions(). We only
 * care about the fields needed for the Payment History row.
 */
export interface BillingPayment {
  id: string;
  type: string;
  amount: number | string;
  recordedAt: string;
  paymentNumber?: string | null;
  paymentMethod?: string | null;
  referenceNumber?: string | null;
  notes?: string | null;
  paymentLines?: BillingPaymentLine[] | null;
}

export interface ConsolidatedBillingInput {
  customer: BillingCustomer;
  soas: BillingSOA[];
  /** Optional — customer's PAYMENT transactions from listTransactions. */
  payments?: BillingPayment[];
  /** Today's date / "as of" date. Defaults to new Date() if not provided. */
  asOf?: string | Date;
  /**
   * Which SOAs to include:
   *   "all"     — every non-void SOA (default)
   *   "unpaid"  — only GENERATED, SENT, PARTIAL (skip PAID and VOID)
   */
  filter?: "all" | "unpaid";
}

/* ── Helpers ── */
function fmt(v: number): string {
  return v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPeriod(fromIso: string, toIso: string): string {
  const f = new Date(fromIso);
  const t = new Date(toIso);
  const sameYear = f.getFullYear() === t.getFullYear();
  const short: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const withYear: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  if (sameYear) {
    return `${f.toLocaleDateString("en-US", short)} \u2013 ${t.toLocaleDateString("en-US", withYear)}`;
  }
  return `${f.toLocaleDateString("en-US", withYear)} \u2013 ${t.toLocaleDateString("en-US", withYear)}`;
}

function fmtDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtAsOf(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function num(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Days between two dates (b - a), ignoring time-of-day. */
function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

/**
 * Extract SOA numbers from a payment's notes field. The payment-submit flow
 * writes "[SOA: SOA-2026-0062, SOA-2026-0063]" as a marker — see
 * apps/web/src/app/customers/[id]/page.tsx payment submit and
 * recordMultiCustomerPayment in the API service.
 */
function extractSoaRefs(notes: string | null | undefined): string[] {
  if (!notes) return [];
  const m = notes.match(/\[SOA:\s*([^\]]+)\]/);
  if (!m) return [];
  return m[1]
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Friendly label for a method code. */
function methodLabel(method: string | null | undefined): string {
  const m = (method || "").toUpperCase();
  switch (m) {
    case "CASH": return "Cash";
    case "CHECK": return "Check";
    case "CREDIT_CARD": return "Card";
    case "DEBIT_CARD": return "Debit";
    case "BANK_TRANSFER": return "Bank Transfer";
    case "GCASH": return "GCash";
    case "EWT": return "EWT";
    case "SPLIT": return "Split";
    case "": return "\u2014";
    default: return method || "\u2014";
  }
}

/** Format a single payment line with its method-specific details. */
function formatLine(l: BillingPaymentLine): string {
  const m = (l.method || "").toUpperCase();
  switch (m) {
    case "CASH":
      return "Cash";
    case "CHECK": {
      const parts: string[] = [];
      if (l.bank) parts.push(l.bank);
      if (l.checkNumber) parts.push(`#${l.checkNumber}`);
      return parts.length > 0 ? `Check (${parts.join(", ")})` : "Check";
    }
    case "CREDIT_CARD":
    case "DEBIT_CARD": {
      const parts: string[] = [];
      if (l.cardType) parts.push(l.cardType);
      if (l.traceNumber) parts.push(`#${l.traceNumber}`);
      return parts.length > 0 ? `Card (${parts.join(", ")})` : "Card";
    }
    case "BANK_TRANSFER":
      return l.reference ? `Bank Transfer (#${l.reference})` : "Bank Transfer";
    case "GCASH":
      return l.reference ? `GCash (#${l.reference})` : "GCash";
    case "EWT":
      return `EWT${l.rate ? ` (${l.rate}%)` : ""}`;
    default:
      return methodLabel(l.method);
  }
}

/** Build the "Method" column value from paymentLines or the fallback method. */
function formatPaymentMethod(p: BillingPayment): string {
  const lines = (p.paymentLines || []).filter((l) => (l.method || "").toUpperCase() !== "EWT");
  if (lines.length === 0) {
    // Fallback: primary method + optional reference
    const primary = methodLabel(p.paymentMethod);
    if (p.referenceNumber) return `${primary} (#${p.referenceNumber})`;
    return primary;
  }
  if (lines.length === 1) {
    return formatLine(lines[0]);
  }
  // Multi-line split — comma-separate
  return lines.map(formatLine).join(", ");
}

const STATUS_LABELS: Record<string, string> = {
  GENERATED: "GENERATED",
  SENT: "SENT",
  PARTIAL: "PARTIAL",
  PAID: "PAID",
  VOID: "VOID",
};

/* ── Main export ── */
export function buildConsolidatedBillingHtml(input: ConsolidatedBillingInput): string {
  const c = input.customer;
  const asOf = input.asOf
    ? typeof input.asOf === "string"
      ? new Date(input.asOf)
      : input.asOf
    : new Date();
  const filter = input.filter ?? "all";

  // Filter + sort SOAs (newest period first — matches SOA History tab ordering)
  const all = (input.soas || []).filter((s) => s.status !== "VOID");
  const included =
    filter === "unpaid"
      ? all.filter((s) => s.status !== "PAID")
      : all;

  const sortedSoas = [...included].sort((a, b) => {
    const da = new Date(a.dateTo).getTime();
    const db = new Date(b.dateTo).getTime();
    return db - da;
  });

  // Per-row numbers + summary totals
  let totalBilled = 0;
  let totalPaid = 0;
  let totalOutstanding = 0;

  // Aging buckets — bucket by days since the SOA's period end (dateTo)
  let ageCurrent = 0; // 0–30 days
  let age31to60 = 0;
  let age61to90 = 0;
  let ageOver90 = 0;

  const rows = sortedSoas.map((s) => {
    const payable = num(s.totalPayable);
    const paid = num(s.paidAmount);
    const balance = Math.max(0, payable - paid);

    totalBilled += payable;
    totalPaid += paid;
    totalOutstanding += balance;

    // Aging only counts the outstanding portion (balance), not the full payable
    if (balance > 0.005) {
      const dateTo = new Date(s.dateTo);
      const daysOld = daysBetween(dateTo, asOf);
      if (daysOld <= 30) ageCurrent += balance;
      else if (daysOld <= 60) age31to60 += balance;
      else if (daysOld <= 90) age61to90 += balance;
      else ageOver90 += balance;
    }

    return {
      soaNumber: s.soaNumber,
      period: fmtPeriod(s.dateFrom, s.dateTo),
      payable,
      paid,
      balance,
      status: STATUS_LABELS[s.status] ?? s.status,
    };
  });

  // ── Build payment rows ──
  // Filter to this customer's PAYMENT transactions only, oldest-first for
  // chronological readability. Parse SOA references from notes.
  const paymentsRaw = (input.payments || []).filter((p) => p.type === "PAYMENT");
  const sortedPayments = [...paymentsRaw].sort(
    (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
  );

  let paymentSumHeader = 0;
  const paymentRows = sortedPayments.map((p) => {
    const amt = num(p.amount);
    paymentSumHeader += amt;
    const soaRefs = extractSoaRefs(p.notes);
    return {
      date: fmtDateShort(p.recordedAt),
      receipt: p.paymentNumber || "\u2014",
      soaApplied: soaRefs.length > 0 ? soaRefs.join(", ") : (p.notes?.trim() || "\u2014"),
      method: formatPaymentMethod(p),
      amount: amt,
    };
  });

  const terms = c.paymentTermsDays === 0 ? "COD" : `Net ${c.paymentTermsDays}`;
  const customerTypeLabel = (c.customerType || "").toString() || "&nbsp;";
  const accountNumber = c.phone?.startsWith("AR-") ? c.phone : "&nbsp;";

  // SOA table body — no empty padding rows
  const soaBody =
    rows.length === 0
      ? `<tr><td colspan="6" class="empty">No statements of account to display.</td></tr>`
      : rows
          .map(
            (r) => `<tr>
<td class="c mono">${esc(r.soaNumber)}</td>
<td class="c">${esc(r.period)}</td>
<td class="r">${fmt(r.payable)}</td>
<td class="r">${r.paid > 0.005 ? fmt(r.paid) : "\u2013"}</td>
<td class="r ${r.balance > 0.005 ? "bal-due" : ""}">${r.balance > 0.005 ? fmt(r.balance) : "\u2013"}</td>
<td class="c status ${r.status.toLowerCase()}">${esc(r.status)}</td>
</tr>`,
          )
          .join("");

  // Payment History body
  const paymentBody =
    paymentRows.length === 0
      ? `<tr><td colspan="5" class="empty">No payments recorded.</td></tr>`
      : paymentRows
          .map(
            (p) => `<tr>
<td class="c">${esc(p.date)}</td>
<td class="c mono">${esc(p.receipt)}</td>
<td class="c mono">${esc(p.soaApplied)}</td>
<td class="ml">${esc(p.method)}</td>
<td class="r">${fmt(p.amount)}</td>
</tr>`,
          )
          .join("");

  const paymentTotalRow =
    paymentRows.length > 0
      ? `<tr class="total-row">
<td colspan="4" class="r tot-label">Total Payments</td>
<td class="r tot-value">\u20B1${fmt(paymentSumHeader)}</td>
</tr>`
      : "";

  const filterBadge =
    filter === "unpaid"
      ? `<div class="filter-badge">UNPAID STATEMENTS ONLY</div>`
      : "";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Consolidated Billing Statement - ${esc(c.name)}</title>
<style>
@page { size: letter portrait; margin: 16mm 12mm 10mm 12mm; }
html, body { margin: 0; padding: 0; height: 100%; background: #fff; }
body { font-family: Arial, sans-serif; font-size: 9pt; color: #000; }

/* Flex column layout: content at top, spacer flex-grows, footer at bottom */
.page {
  display: flex;
  flex-direction: column;
  /* Letter minus margins (279mm - 16 - 10 = 253mm content height). Using
     245mm to leave breathing room for browser print driver quirks. */
  min-height: 245mm;
}
.page-top { flex: 0 0 auto; }
.page-spacer { flex: 1 1 auto; min-height: 6mm; }
.page-bottom { flex: 0 0 auto; }

table { border-collapse: collapse; width: 100%; }
td, th { border: 1px solid #000; padding: 4px 6px; font-size: 9pt; vertical-align: middle; }
th { background: #e8e8e8; font-weight: 700; font-size: 8.5pt; text-align: center; }
/* All monetary/amount cells right-align with tabular monospace */
.r, .amount { text-align: right; font-family: 'Courier New', Courier, monospace; }
.c { text-align: center; }
.ml { text-align: left; }
.mono { font-family: 'Courier New', Courier, monospace; font-weight: 700; }
.empty { text-align: center; font-style: italic; color: #666; padding: 14px; }
.hdr { font-family: 'Rockwell Extra Bold', Rockwell, Georgia, serif; font-weight: 900; font-size: 16pt; text-align: center; letter-spacing: 0.5px; margin-bottom: 2px; }
.subhdr { font-family: Arial, sans-serif; font-weight: 700; font-size: 12pt; text-align: center; margin-bottom: 6px; letter-spacing: 1px; }
.filter-badge { text-align: center; background: #fff3cd; border: 1px solid #856404; color: #856404; padding: 2px 8px; margin: 0 auto 6px; font-size: 8pt; font-weight: 700; display: inline-block; }
.filter-wrap { text-align: center; margin-bottom: 4px; }
.bal-due { color: #b91c1c; font-weight: 700; }
.status { font-weight: 700; font-size: 8pt; }
.status.paid { color: #065f46; }
.status.partial { color: #b45309; }
.status.generated, .status.sent { color: #374151; }
.section-title {
  background: #d0d0d0;
  font-weight: 700;
  font-size: 9pt;
  padding: 4px 6px;
  border: 1px solid #000;
  border-bottom: none;
  text-align: left;
  margin-top: 0;
}
/* Thin horizontal rule between major data sections */
.section-divider {
  border: none;
  border-top: 1px solid #999;
  margin: 8px 0 6px;
}
.total-row td { background: #e8e8e8; font-weight: 700; font-size: 9pt; }
.tot-label { font-family: Arial, sans-serif; }
.tot-value { font-size: 10pt; }
.summary-tbl td { padding: 4px 8px; font-size: 9.5pt; }
.summary-tbl .label { font-weight: 700; background: #f4f4f4; width: 60%; }
.summary-tbl .value { text-align: right; font-family: 'Courier New', Courier, monospace; font-weight: 700; width: 40%; }
/* Total Outstanding — the hero number on the page */
.summary-tbl tr.outstanding td {
  background: #fff1f1;
  border-top: 2px solid #b91c1c;
}
.summary-tbl tr.outstanding .label {
  color: #7f1d1d;
  font-size: 10.5pt;
  background: #fff1f1;
}
.summary-tbl tr.outstanding .value {
  color: #b91c1c;
  font-size: 13pt;
  font-weight: 900;
  background: #fff1f1;
}
.aging-tbl td { padding: 4px 8px; font-size: 9pt; }
.aging-tbl .label { background: #f4f4f4; width: 60%; }
.aging-tbl .value { text-align: right; font-family: 'Courier New', Courier, monospace; width: 40%; }
.notice { text-align: center; font-size: 8pt; font-weight: 700; margin: 6px 0 4px; line-height: 1.4; }
.sig-tbl td { padding: 4px 6px; font-size: 8pt; line-height: 1.8; vertical-align: top; }
.LB { border: none; border-bottom: 1px solid #000; padding: 1px 0; }
.LN { border: none; padding: 1px 0; font-weight: 700; white-space: nowrap; }
</style></head><body>

<div class="page">

<!-- ── TOP: all content ── -->
<div class="page-top">

<div class="hdr">C-BROS GENUINE AUTOPARTS &amp; ACCESSORIES, INC.</div>
<div class="subhdr">CONSOLIDATED BILLING STATEMENT</div>
${filterBadge ? `<div class="filter-wrap">${filterBadge}</div>` : ""}

<!-- Customer info block -->
<table style="margin-bottom:6px;table-layout:fixed">
<colgroup><col style="width:55%"><col style="width:45%"></colgroup>
<tr>
<td style="vertical-align:top;padding:4px 8px">
  <table style="border:none;width:100%;border-collapse:collapse;table-layout:fixed">
    <colgroup><col style="width:110px"><col></colgroup>
    <tr><td class="LN">CUSTOMER:</td><td class="LB"><span style="font-size:11pt;font-weight:700">${esc(c.name)}</span></td></tr>
    <tr><td class="LN">CONTACT PERSON:</td><td class="LB">${c.contactPerson ? esc(c.contactPerson) : "&nbsp;"}</td></tr>
    <tr><td class="LN">ADDRESS:</td><td class="LB">${c.address ? esc(c.address) : "&nbsp;"}</td></tr>
    <tr><td class="LN">TYPE:</td><td class="LB">${esc(customerTypeLabel)}</td></tr>
  </table>
</td>
<td style="vertical-align:top;padding:4px 8px">
  <table style="border:none;width:100%;border-collapse:collapse;table-layout:fixed">
    <colgroup><col style="width:90px"><col></colgroup>
    <tr><td class="LN">ACCOUNT:</td><td class="LB"><span style="font-family:'Courier New',monospace;font-weight:700">${accountNumber}</span></td></tr>
    <tr><td class="LN">PHONE:</td><td class="LB">${c.phone?.startsWith("AR-") ? "&nbsp;" : esc(c.phone || "")}</td></tr>
    <tr><td class="LN">EMAIL:</td><td class="LB">${c.email ? esc(c.email) : "&nbsp;"}</td></tr>
    <tr><td class="LN">TERMS:</td><td class="LB">${terms}</td></tr>
    <tr><td class="LN">AS OF:</td><td class="LB"><b>${fmtAsOf(asOf)}</b></td></tr>
  </table>
</td>
</tr>
</table>

<!-- SOA List -->
<div class="section-title">STATEMENTS OF ACCOUNT</div>
<table style="table-layout:fixed">
<colgroup>
  <col style="width:16%">
  <col style="width:24%">
  <col style="width:16%">
  <col style="width:14%">
  <col style="width:16%">
  <col style="width:14%">
</colgroup>
<thead>
<tr>
  <th>SOA #</th>
  <th>PERIOD</th>
  <th>PAYABLE</th>
  <th>PAID</th>
  <th>BALANCE</th>
  <th>STATUS</th>
</tr>
</thead>
<tbody>
${soaBody}
</tbody>
</table>

<hr class="section-divider">

<!-- Payment History -->
<div class="section-title">PAYMENT HISTORY</div>
<table style="table-layout:fixed">
<colgroup>
  <col style="width:14%">
  <col style="width:17%">
  <col style="width:20%">
  <col style="width:31%">
  <col style="width:18%">
</colgroup>
<thead>
<tr>
  <th>DATE</th>
  <th>RECEIPT #</th>
  <th>SOA APPLIED</th>
  <th>METHOD</th>
  <th>AMOUNT</th>
</tr>
</thead>
<tbody>
${paymentBody}
${paymentTotalRow}
</tbody>
</table>

<hr class="section-divider">

<!-- Summary + Aging side by side — sits right after Payment History so all
     data flows together. The spacer below pushes only the footer down. -->
<table style="border:none;table-layout:fixed">
<colgroup><col style="width:50%"><col style="width:50%"></colgroup>
<tr>
<td style="border:none;padding-right:4px;vertical-align:top">
  <div class="section-title">SUMMARY</div>
  <table class="summary-tbl">
    <tr><td class="label">Total Billed</td><td class="value">\u20B1${fmt(totalBilled)}</td></tr>
    <tr><td class="label">Total Paid</td><td class="value">\u20B1${fmt(totalPaid)}</td></tr>
    <tr class="outstanding"><td class="label">Total Outstanding</td><td class="value">\u20B1${fmt(totalOutstanding)}</td></tr>
  </table>
</td>
<td style="border:none;padding-left:4px;vertical-align:top">
  <div class="section-title">AGING</div>
  <table class="aging-tbl">
    <tr><td class="label">Current (0-30 days)</td><td class="value">\u20B1${fmt(ageCurrent)}</td></tr>
    <tr><td class="label">31-60 days</td><td class="value">\u20B1${fmt(age31to60)}</td></tr>
    <tr><td class="label">61-90 days</td><td class="value">\u20B1${fmt(age61to90)}</td></tr>
    <tr><td class="label">Over 90 days</td><td class="value">\u20B1${fmt(ageOver90)}</td></tr>
  </table>
</td>
</tr>
</table>

</div><!-- /page-top -->

<!-- ── SPACER: only pushes the signature block to the page bottom ── -->
<div class="page-spacer">&nbsp;</div>

<!-- ── BOTTOM: notice + signature block, always pinned to page bottom ── -->
<div class="page-bottom">

<div class="notice">
PLEASE MAKE CHECK PAYABLE TO C-BROS GENUINE AUTOPARTS &amp; ACCESSORIES, INC.<br>
PAYMENTS WILL BE COLLECTED WITHIN 5 DAYS AFTER RECEIPT OF SOA.
</div>

<table class="sig-tbl">
<tr>
<td style="width:45%">
<b>RECEIVED THE ABOVE STATEMENT OF ACCOUNT:</b><br>
PRINTED NAME: ________________________<br>
SIGNATURE: ________________________<br>
DATE RECEIVED: ________________________
</td>
<td style="width:30%">
<b>PAYMENT DETAILS</b><br>
CASH: ________________<br>
CHECK: _______________<br>
DATE: ________________
</td>
<td style="width:25%">
<b>RCVD BY:</b><br><br>
________________________
</td>
</tr>
</table>

</div><!-- /page-bottom -->

</div><!-- /page -->

</body></html>`;
}
