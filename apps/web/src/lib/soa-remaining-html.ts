/**
 * Generates a printable SOA Remaining Balance statement.
 */

export interface SOARemainingData {
  customerName: string;
  customerCode: string;
  soaNumber: string;
  period: string;
  unpaidInvoices: Array<{ referenceNumber: string; date: string; originalAmount: number; paidAmount: number; remainingAmount: number; type: string }>;
  paymentsReceived: Array<{ referenceNumber: string; date: string; amount: number }>;
  originalTotal: number;
  totalPayments: number;
  remainingBalance: number;
}

function fmt(v: number): string {
  return v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function buildSOARemainingHtml(d: SOARemainingData): string {
  const invoiceRows = d.unpaidInvoices.map((inv) => {
    const isCredit = inv.type === "CREDIT_NOTE";
    return `<tr>
<td>${fmtDate(inv.date)}</td>
<td style="font-family:monospace;font-weight:600">${esc(inv.referenceNumber)}</td>
<td style="text-align:right">${isCredit ? `(${fmt(inv.originalAmount)})` : fmt(inv.originalAmount)}</td>
<td style="text-align:right">${inv.paidAmount > 0 ? fmt(inv.paidAmount) : "\u2014"}</td>
<td style="text-align:right;font-weight:600">${isCredit ? "(applied)" : fmt(inv.remainingAmount)}</td>
</tr>`;
  }).join("\n");

  const paymentRows = d.paymentsReceived.length > 0 ? d.paymentsReceived.map((p) =>
    `<tr><td>${fmtDate(p.date)}</td><td style="font-family:monospace">${esc(p.referenceNumber)}</td><td style="text-align:right">${fmt(p.amount)}</td></tr>`
  ).join("\n") : `<tr><td colspan="3" style="color:#999">No payments received</td></tr>`;

  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>SOA Remaining - ${esc(d.customerName)}</title>
<style>
@page { size: letter portrait; margin: 15mm 12mm; }
body { font-family: Arial, sans-serif; font-size: 10pt; color: #000; margin: 0; padding: 0; }
.header { font-family: 'Rockwell Extra Bold', Rockwell, Georgia, serif; font-weight: 900; font-size: 14pt; text-align: center; }
.title { text-align: center; font-weight: 700; font-size: 11pt; margin: 4px 0 14px; color: #333; }
.info { margin-bottom: 14px; font-size: 10pt; line-height: 1.6; }
.info b { display: inline-block; width: 110px; }
.section-title { font-weight: 700; font-size: 10pt; margin: 14px 0 4px; border-bottom: 1px solid #000; padding-bottom: 2px; }
table { width: 100%; border-collapse: collapse; font-size: 9pt; }
th { background: #f3f4f6; text-align: left; padding: 5px 6px; font-size: 8.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; border-bottom: 2px solid #000; }
th.right { text-align: right; }
td { padding: 4px 6px; border-bottom: 1px solid #e5e7eb; }
.total-row { border-top: 2px solid #000; font-weight: 700; }
.summary { margin-top: 16px; font-size: 10pt; }
.summary table { width: auto; margin-left: auto; }
.summary td { border: none; padding: 3px 10px; }
.summary .label { text-align: right; color: #666; }
.summary .amount { text-align: right; font-weight: 600; }
.summary .total { font-size: 11pt; border-top: 2px solid #000; }
.as-of { margin-top: 12px; font-size: 8.5pt; color: #666; text-align: right; }
.sig { margin-top: 30px; font-size: 9pt; line-height: 2.2; }
.footer { margin-top: 16px; font-size: 7.5pt; color: #666; text-align: center; }
</style></head><body>

<div class="header">C-BROS GENUINE AUTOPARTS &amp; ACCESSORIES, INC.</div>
<div class="title">STATEMENT OF ACCOUNT &mdash; REMAINING BALANCE</div>

<div class="info">
<div><b>Customer:</b> ${esc(d.customerName)}</div>
<div><b>Account:</b> ${esc(d.customerCode)}</div>
<div><b>SOA #:</b> ${esc(d.soaNumber)}</div>
<div><b>SOA Period:</b> ${esc(d.period)}</div>
</div>

<div class="section-title">Unpaid Invoices</div>
<table>
<thead>
<tr><th>Date</th><th>Invoice #</th><th class="right">Original</th><th class="right">Paid</th><th class="right">Remaining</th></tr>
</thead>
<tbody>
${invoiceRows}
</tbody>
</table>

<div class="section-title">Payments Received</div>
<table>
<thead>
<tr><th>Date</th><th>Reference</th><th class="right">Amount</th></tr>
</thead>
<tbody>
${paymentRows}
</tbody>
</table>

<div class="summary">
<table>
<tr><td class="label">Original SOA Total:</td><td class="amount">\u20B1${fmt(d.originalTotal)}</td></tr>
<tr><td class="label">Total Payments Received:</td><td class="amount">-\u20B1${fmt(d.totalPayments)}</td></tr>
<tr class="total"><td class="label">Remaining Balance:</td><td class="amount">\u20B1${fmt(d.remainingBalance)}</td></tr>
</table>
</div>

<div class="as-of">As of: ${today}</div>

<div class="sig">
<table style="width:100%;border:none">
<tr><td style="border:none;width:50%">Prepared by: ______________________________________</td><td style="border:none">Approved by: ______________________________________</td></tr>
</table>
</div>

<div class="footer">This is a computer-generated document.</div>

</body></html>`;
}
