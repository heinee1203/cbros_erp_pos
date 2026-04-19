/**
 * Generates a printable Collection Receipt (single copy, quarter-page portrait letter).
 */
import { amountToWords } from "./amount-to-words";

export interface PaymentLineData {
  method: string;
  amount: number;
  reference?: string;
  bank?: string;
  checkNumber?: string;
  checkDate?: string;
  cardType?: string;
  batchNumber?: string;
  traceNumber?: string;
  rate?: number;
  bir2307?: string;
  baseAmount?: number;
}

export interface PaymentReceiptData {
  receiptNumber: string;
  date: string;
  customer: { name: string; code: string };
  amount: number;
  method: string;
  referenceNumber?: string;
  cardType?: string;
  batchNumber?: string;
  traceNumber?: string;
  paymentLines?: PaymentLineData[];
  soaApplications: Array<{ soaNumber: string; period: string; amount: number; soaTotal?: number; soaRemaining?: number }>;
  settledInvoices?: Array<{ referenceNumber: string; amount: number; soaNumber?: string }>;
  previousBalance: number;
  newBalance: number;
  notes?: string;
}

function fmt(v: number): string {
  return "\u20B1" + v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const METHOD_LABELS: Record<string, string> = { CASH: "Cash", CHECK: "Check", BANK_TRANSFER: "Bank Transfer", CREDIT_CARD: "Credit Card", GCASH: "GCash", MAYA: "Maya", QRPH: "QRPH", EWT: "EWT", OTHER: "Other" };

function fmtShortDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function buildAppliedToSection(d: PaymentReceiptData): string {
  const soas = d.soaApplications;
  const invoices = d.settledInvoices || [];

  // No SOA — general balance
  if (soas.length === 0 || !soas[0].soaNumber) {
    return `<tr><td class="lbl">Applied to:</td><td colspan="3">General Balance</td></tr>`;
  }

  // Single SOA
  if (soas.length === 1) {
    const soa = soas[0];
    const soaNum = soa.soaNumber;
    const soaInvoices = invoices.length > 0 ? invoices.filter((i) => !i.soaNumber || i.soaNumber === soaNum) : [];

    // Hide the Invoices Settled list when this payment fully settles the only
    // SOA — the SOA number on the "Applied to" row is authoritative and the
    // invoice list is redundant noise. Use soaRemaining (post-payment balance)
    // as the source of truth; fall back to the legacy amount-vs-invoice-net
    // check when the caller didn't include soaRemaining.
    const fullySettled = soa.soaRemaining !== undefined
      ? soa.soaRemaining < 0.005
      : (() => {
          const invoiceNet = soaInvoices.reduce((s, inv) => s + inv.amount, 0);
          return soaInvoices.length > 0 && Math.abs(d.amount - Math.abs(invoiceNet)) < 1;
        })();

    let html = `<tr><td class="lbl">Applied to:</td><td colspan="3">${esc(soaNum)}</td></tr>`;
    if (!fullySettled && soaInvoices.length > 0) {
      html += `<tr><td colspan="4"><div style="margin-top:2px"><div style="font-weight:700;font-size:6.5pt;margin-bottom:1px">Invoices Settled:</div><table style="width:100%;border-collapse:collapse;line-height:1.2">`;
      html += soaInvoices.map((inv) => `<tr><td style="padding:1px 0 1px 4px;font-size:6.5pt;font-family:monospace">${esc(inv.referenceNumber)}</td><td style="text-align:right;padding:1px 0;font-size:6.5pt">${fmt(inv.amount)}</td></tr>`).join("\n");
      html += `</table></div></td></tr>`;
    }
    return html;
  }

  // Multiple SOAs — per-SOA breakdown
  let html = `<tr><td class="lbl" style="vertical-align:top">Applied to:</td><td colspan="3">`;

  for (const soa of soas) {
    const soaInvoices = invoices.filter((i) => i.soaNumber === soa.soaNumber);
    const soaInvTotal = soaInvoices.reduce((s, inv) => s + Math.abs(inv.amount), 0);
    const isFullSOA = soaInvoices.length > 0 && soaInvTotal > 0 && Math.abs(soaInvTotal - Math.abs(soa.amount || soaInvTotal)) < 1;

    html += `<div style="margin-bottom:3px"><span style="font-family:monospace;font-weight:600;font-size:6.5pt">${esc(soa.soaNumber)}</span>`;
    if (soaInvTotal > 0) html += ` <span style="font-size:6pt;color:#666">${fmt(soaInvTotal)}</span>`;
    if (isFullSOA) html += ` <span style="font-size:5.5pt;color:#059669">Fully Paid</span>`;
    else if (soaInvoices.length > 0) html += ` <span style="font-size:5.5pt;color:#d97706">Partial</span>`;
    html += `</div>`;

    // Show invoice list only for partial SOAs
    if (!isFullSOA && soaInvoices.length > 0) {
      html += `<table style="width:100%;border-collapse:collapse;line-height:1.2;margin-bottom:2px">`;
      html += soaInvoices.map((inv) => `<tr><td style="padding:0 0 0 8px;font-size:6pt;font-family:monospace">${esc(inv.referenceNumber)}</td><td style="text-align:right;padding:0;font-size:6pt">${fmt(inv.amount)}</td></tr>`).join("\n");
      html += `</table>`;
    }
  }

  html += `</td></tr>`;
  return html;
}

function buildAppliedTo(d: PaymentReceiptData): string {
  const soa = d.soaApplications;
  if (soa.length > 0 && soa[0].soaNumber) {
    return soa.map((s) => esc(s.soaNumber)).join(", ");
  }
  return "General Balance";
}

function formatLineDetail(l: PaymentLineData, d: PaymentReceiptData): string {
  const label = METHOD_LABELS[l.method] ?? l.method;
  let detail = "";
  if (l.method === "CHECK") {
    const parts: string[] = [];
    if (l.bank) parts.push(l.bank);
    if (l.checkNumber) parts.push(`#${l.checkNumber}`);
    if (l.checkDate) parts.push(fmtShortDate(l.checkDate));
    if (parts.length > 0) detail = ` (${parts.join(", ")})`;
  } else if (l.method === "CREDIT_CARD") {
    const parts: string[] = [];
    if (l.cardType) parts.push(l.cardType);
    if (l.batchNumber) parts.push(`Batch: ${l.batchNumber}`);
    if (l.traceNumber) parts.push(`Trace: ${l.traceNumber}`);
    if (parts.length > 0) detail = ` (${parts.join(", ")})`;
  } else if (l.method === "EWT") {
    const parts: string[] = [];
    if (l.rate) parts.push(`${l.rate}%`);
    if (l.bir2307) parts.push(`BIR 2307: ${l.bir2307}`);
    if (parts.length > 0) detail = ` (${parts.join(", ")})`;
  } else if (l.method === "BANK_TRANSFER" || l.method === "GCASH" || l.method === "MAYA" || l.method === "QRPH") {
    if (l.reference) detail = ` (Ref: ${l.reference})`;
  }
  return `${esc(label)}${esc(detail)}`;
}

function buildPaymentDetails(d: PaymentReceiptData): string {
  // Build payment lines from the structured array, or fall back to top-level fields
  let effectiveLines: PaymentLineData[] = [];

  if (d.paymentLines && d.paymentLines.length > 0) {
    effectiveLines = d.paymentLines;
  } else {
    // Legacy: no paymentLines — build from top-level fields
    effectiveLines = [{
      method: d.method, amount: d.amount,
      bank: undefined, checkNumber: undefined, checkDate: undefined,
      reference: d.referenceNumber, cardType: d.cardType,
      batchNumber: d.batchNumber, traceNumber: d.traceNumber,
    }];
  }

  // Single-line branch: inline label rows (Amount / Method / Bank / Check No /
  // Check Date) — matches the physical receipt's layout. The numbered Payment
  // Breakdown block adds visual noise when there's only one line.
  if (effectiveLines.length === 1) {
    const l = effectiveLines[0];
    const methodLabel = METHOD_LABELS[l.method] ?? l.method;
    const rows: string[] = [];
    rows.push(
      `<tr><td class="lbl">Amount:</td><td>${fmt(l.amount)}</td><td class="lbl2">Method:</td><td>${esc(methodLabel)}</td></tr>`
    );
    if (l.method === "CHECK") {
      if (l.bank) rows.push(`<tr><td class="lbl">Bank:</td><td colspan="3">${esc(l.bank)}</td></tr>`);
      if (l.checkNumber) rows.push(`<tr><td class="lbl">Check No:</td><td colspan="3">${esc(l.checkNumber)}</td></tr>`);
      if (l.checkDate) rows.push(`<tr><td class="lbl">Check Date:</td><td colspan="3">${esc(fmtShortDate(l.checkDate))}</td></tr>`);
    } else if (l.method === "CREDIT_CARD") {
      if (l.cardType) rows.push(`<tr><td class="lbl">Card Type:</td><td colspan="3">${esc(l.cardType)}</td></tr>`);
      if (l.batchNumber) rows.push(`<tr><td class="lbl">Batch No:</td><td colspan="3">${esc(l.batchNumber)}</td></tr>`);
      if (l.traceNumber) rows.push(`<tr><td class="lbl">Trace No:</td><td colspan="3">${esc(l.traceNumber)}</td></tr>`);
    } else if (l.method === "BANK_TRANSFER" || l.method === "GCASH" || l.method === "MAYA" || l.method === "QRPH") {
      if (l.reference) rows.push(`<tr><td class="lbl">Reference:</td><td colspan="3">${esc(l.reference)}</td></tr>`);
    } else if (l.method === "EWT") {
      if (l.rate) rows.push(`<tr><td class="lbl">Rate:</td><td colspan="3">${l.rate}%</td></tr>`);
      if (l.bir2307) rows.push(`<tr><td class="lbl">BIR 2307:</td><td colspan="3">${esc(l.bir2307)}</td></tr>`);
    }
    return rows.join("\n");
  }

  // Multi-line branch: numbered Payment Breakdown table — preserves working
  // behavior for split payments (e.g. Cash + Check).
  const hasEwt = effectiveLines.some((l) => l.method === "EWT");
  const rows = effectiveLines.map((l, i) =>
    `<tr><td style="padding:1px 0;font-size:7pt">${i + 1}. ${formatLineDetail(l, d)}</td><td style="text-align:right;padding:1px 0;font-size:7pt;tabular-nums">${fmt(l.amount)}</td></tr>`
  ).join("\n");

  return `
<tr><td class="lbl" style="vertical-align:top" colspan="4">
<div style="margin-top:4px;font-weight:700;font-size:7pt;margin-bottom:2px">Payment Breakdown:</div>
<table style="width:100%;border-collapse:collapse">
${rows}
<tr><td colspan="2" style="border-top:1px solid #000;padding-top:2px"></td></tr>
<tr><td style="font-weight:700;font-size:7pt;padding:1px 0">${hasEwt ? "Total Applied" : "Total"}</td><td style="text-align:right;font-weight:700;font-size:7.5pt;padding:1px 0">${fmt(d.amount)}</td></tr>
</table>
</td></tr>`;
}

export function buildPaymentReceiptHtml(d: PaymentReceiptData): string {
  const dateStr = new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Collection Receipt - ${esc(d.customer.name)}</title>
<style>
@page { size: letter portrait; margin: 5mm 10mm 8mm 2.125in; }
body { font-family: Arial, sans-serif; font-size: 7.5pt; color: #000; margin: 0; padding: 0; background: #fff; line-height: 1.3; }
.receipt {
  width: 4.25in;
  min-height: 5.5in;
  border: 1px solid #000;
  padding: 6px 12px 10px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}
.content-section { flex: 0 0 auto; }
.spacer { flex: 1 1 auto; }
.top-section {}
.header { font-family: 'Rockwell Extra Bold', Rockwell, Georgia, serif; font-weight: 900; font-size: 10.5pt; text-align: center; letter-spacing: 0.3px; line-height: 1.2; }
.title { text-align: center; font-weight: 700; font-size: 9pt; margin: 1px 0 3px; }
.meta { display: flex; justify-content: space-between; font-size: 7.5pt; margin-bottom: 2px; }
hr { border: none; border-top: 1px solid #000; margin: 2px 0; }
table.fields { width: 100%; border-collapse: collapse; font-size: 7.5pt; line-height: 1.3; }
table.fields td { border: none; padding: 1px 2px 1px 0; }
table.fields td.lbl { font-weight: 700; white-space: nowrap; width: 80px; }
table.fields td.lbl2 { font-weight: 700; white-space: nowrap; width: 70px; padding-left: 8px; }
.bottom-section {
  margin-top: 4px;
  page-break-inside: avoid;
}
.sig-table { width: 100%; border-collapse: collapse; font-size: 7pt; line-height: 1.8; table-layout: fixed; }
.sig-table td { border: none; padding: 0; overflow: hidden; }
.footer { font-size: 6pt; color: #666; margin-top: 2px; text-align: center; }
</style></head><body>

<div class="receipt">
<div class="content-section">
<div class="top-section">
  <div class="header">C-BROS GENUINE AUTOPARTS &amp; ACCESSORIES, INC.</div>
  <div class="title">COLLECTION RECEIPT</div>

  <div class="meta">
    <span><b>Receipt No:</b> ${esc(d.receiptNumber)}</span>
    <span><b>Date:</b> ${dateStr}</span>
  </div>

  <hr>

  <table class="fields">
  <colgroup><col style="width:80px"><col><col style="width:70px"><col></colgroup>
  <tr><td class="lbl">Received from:</td><td>${esc(d.customer.name)}</td><td class="lbl2">Account:</td><td>${esc(d.customer.code)}</td></tr>
  <tr><td class="lbl" style="vertical-align:top">The sum of:</td><td colspan="3" style="font-style:italic;font-size:6.5pt">${amountToWords(d.amount)}</td></tr>
  ${buildPaymentDetails(d)}
  ${buildAppliedToSection(d)}
  </table>
</div>
</div>

<div class="spacer"></div>

<div class="bottom-section">
  <hr>

  <table class="sig-table">
  <tr><td style="width:55%">Received by: _________________________</td><td>Date: _________________________</td></tr>
  <tr><td>Signature: &nbsp;&nbsp;_________________________</td><td></td></tr>
  </table>

  <div class="footer">This is a computer-generated document.</div>
</div>
</div>

</body></html>`;
}
