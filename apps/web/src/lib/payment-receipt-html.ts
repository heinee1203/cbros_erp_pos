/**
 * Generates a printable customer collection receipt.
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
  deductionType?: string;
  description?: string;
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

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  CHECK: "Check",
  BANK_TRANSFER: "Bank Transfer",
  CREDIT_CARD: "Credit Card",
  GCASH: "GCash",
  MAYA: "Maya",
  QRPH: "QRPH",
  EWT: "EWT",
  DEDUCTION: "Deduction",
  OTHER: "Other",
};

function isDeductionLine(line: PaymentLineData): boolean {
  return line.method === "EWT" || line.method === "DEDUCTION";
}

function fmtShortDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getEffectivePaymentLines(d: PaymentReceiptData): PaymentLineData[] {
  if (d.paymentLines && d.paymentLines.length > 0) {
    return d.paymentLines;
  }
  return [{
    method: d.method,
    amount: d.amount,
    reference: d.referenceNumber,
    cardType: d.cardType,
    batchNumber: d.batchNumber,
    traceNumber: d.traceNumber,
  }];
}

function formatLineDetail(line: PaymentLineData): string {
  const label = METHOD_LABELS[line.method] ?? line.method;
  const parts: string[] = [];

  if (line.method === "CHECK") {
    if (line.bank) parts.push(line.bank);
    if (line.checkNumber) parts.push(`#${line.checkNumber}`);
    if (line.checkDate) parts.push(fmtShortDate(line.checkDate));
  } else if (line.method === "CREDIT_CARD") {
    if (line.cardType) parts.push(line.cardType);
    if (line.batchNumber) parts.push(`Batch: ${line.batchNumber}`);
    if (line.traceNumber) parts.push(`Trace: ${line.traceNumber}`);
  } else if (line.method === "EWT") {
    if (line.rate) parts.push(`${line.rate}%`);
    if (line.bir2307) parts.push(`BIR 2307: ${line.bir2307}`);
    if (line.reference) parts.push(`Ref: ${line.reference}`);
    if (line.description && line.description !== "EWT Deduction") parts.push(line.description);
  } else if (line.method === "DEDUCTION") {
    if (line.description) parts.push(line.description);
    else if (line.deductionType) parts.push(line.deductionType.replace(/_/g, " "));
    if (line.reference) parts.push(`Ref: ${line.reference}`);
  } else if (line.method === "BANK_TRANSFER" || line.method === "GCASH" || line.method === "MAYA" || line.method === "QRPH" || line.method === "OTHER") {
    if (line.reference) parts.push(`Ref: ${line.reference}`);
  }

  return `${esc(label)}${parts.length > 0 ? ` <span class="muted">(${esc(parts.join(", "))})</span>` : ""}`;
}

function buildPaymentBreakdownBlock(d: PaymentReceiptData): string {
  const effectiveLines = getEffectivePaymentLines(d);
  const rows = effectiveLines.map((line, index) => `
    <tr class="${isDeductionLine(line) ? "deduction-row" : ""}">
      <td>${index + 1}</td>
      <td>${formatLineDetail(line)}</td>
      <td class="amount">${fmt(line.amount)}</td>
    </tr>`).join("\n");

  return `
<section class="receipt-section">
  <div class="section-title">Payment Details</div>
  <table class="breakdown">
    <thead><tr><th>#</th><th>Method / Ref</th><th class="amount">Amount</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr class="grand"><td colspan="2">Total</td><td class="amount">${fmt(d.amount)}</td></tr>
    </tfoot>
  </table>
</section>`;
}

function buildAppliedToBlock(d: PaymentReceiptData): string {
  const soas = d.soaApplications.filter((soa) => soa.soaNumber);
  const appliedTo = soas.length > 0 ? soas.map((soa) => soa.soaNumber).join(", ") : "General balance";

  return `<div class="applied-line"><span>Applied to:</span><strong>${esc(appliedTo)}</strong></div>`;
}

export function buildPaymentReceiptHtml(d: PaymentReceiptData): string {
  const dateStr = new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Collection Receipt - ${esc(d.customer.name)}</title>
<style>
@page { size: letter portrait; margin: 6mm; }
body { font-family: Arial, sans-serif; font-size: 7.2pt; color: #000; margin: 0; padding: 0; background: #fff; line-height: 1.2; }
.receipt {
  width: 4.25in;
  min-height: 5.35in;
  border: 1.5px solid #000;
  padding: 7px 10px 9px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  margin: 0 auto;
}
.content-section { flex: 0 0 auto; display: flex; flex-direction: column; gap: 5px; }
.spacer { flex: 1 1 auto; }
.header { text-align: center; border-bottom: 1.5px solid #000; padding-bottom: 4px; }
.company { font-family: 'Rockwell Extra Bold', Rockwell, Georgia, serif; font-weight: 900; font-size: 10.2pt; letter-spacing: 0.25px; line-height: 1.05; }
.title { font-weight: 800; font-size: 8.5pt; letter-spacing: 0.8px; margin-top: 1px; }
.meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
.info-box { border: 1px solid #000; padding: 4px 5px; min-height: 30px; }
.info-row { display: grid; grid-template-columns: 62px 1fr; gap: 4px; margin-bottom: 1px; }
.info-row:last-child { margin-bottom: 0; }
.label { font-weight: 800; text-transform: uppercase; font-size: 6.4pt; color: #333; }
.value { font-weight: 700; }
.amount-words { border: 1px solid #000; padding: 4px 5px; display: grid; grid-template-columns: 62px 1fr; gap: 4px; }
.amount-words .words { font-weight: 800; font-style: italic; text-transform: uppercase; }
.receipt-section { border: 1px solid #000; padding: 4px 5px; }
.section-title { font-weight: 900; font-size: 7pt; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 2px; color: #000; }
table { width: 100%; border-collapse: collapse; }
.breakdown th, .breakdown td { padding: 1.5px 0; border-bottom: 1px solid #d6d6d6; vertical-align: top; }
.breakdown th { font-size: 6.2pt; text-transform: uppercase; letter-spacing: 0.3px; color: #333; text-align: left; }
.breakdown td:first-child { width: 16px; color: #555; }
.amount { text-align: right !important; white-space: nowrap; font-variant-numeric: tabular-nums; }
.muted { color: #333; font-size: 6.6pt; }
.deduction-row td { color: #000; }
tfoot td { border-bottom: none !important; font-weight: 800; }
tfoot .grand td { border-top: 1.5px solid #000 !important; font-size: 8pt; }
.mono { font-family: "Courier New", monospace; font-weight: 700; }
.applied-line { border: 1px solid #000; padding: 4px 5px; display: grid; grid-template-columns: 62px 1fr; gap: 4px; }
.applied-line span { font-weight: 800; text-transform: uppercase; font-size: 6.4pt; }
.applied-line strong { font-family: "Courier New", monospace; }
.bottom-section { margin-top: 6px; page-break-inside: avoid; }
.signature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: end; }
.signature-block { border-top: 1px solid #000; padding-top: 2px; min-height: 24px; }
.signature-block strong { display: block; font-size: 6.8pt; text-transform: uppercase; letter-spacing: 0.3px; }
.signature-block span { display: block; margin-top: 1px; font-size: 6.2pt; color: #333; }
.footer { font-size: 5.8pt; color: #444; margin-top: 5px; text-align: center; }
</style></head><body>

<div class="receipt">
<div class="content-section">
  <div class="header">
    <div class="company">C-BROS GENUINE AUTOPARTS &amp; ACCESSORIES, INC.</div>
    <div class="title">COLLECTION RECEIPT</div>
  </div>

  <div class="meta-grid">
    <div class="info-box">
      <div class="info-row"><span class="label">Receipt No.</span><span class="value mono">${esc(d.receiptNumber)}</span></div>
      <div class="info-row"><span class="label">Date</span><span class="value">${dateStr}</span></div>
    </div>
    <div class="info-box">
      <div class="info-row"><span class="label">Customer</span><span class="value">${esc(d.customer.name)}</span></div>
      <div class="info-row"><span class="label">Account</span><span class="value mono">${esc(d.customer.code || "-")}</span></div>
    </div>
  </div>

  <div class="amount-words">
    <span class="label">The sum of</span>
    <span class="words">${amountToWords(d.amount)}</span>
  </div>

  ${buildPaymentBreakdownBlock(d)}
  ${buildAppliedToBlock(d)}
</div>

<div class="spacer"></div>

<div class="bottom-section">
  <div class="signature-grid">
    <div class="signature-block"><strong>Received By</strong><span>Name / Signature</span></div>
    <div class="signature-block"><strong>Date Received</strong><span>Date / Time</span></div>
  </div>

  <div class="footer">This is a computer-generated document.</div>
</div>
</div>

</body></html>`;
}
