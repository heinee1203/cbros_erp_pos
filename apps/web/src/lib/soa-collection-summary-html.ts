/**
 * Generates a printable Collection Summary for an SOA — all payments received.
 */

export interface CollectionPayment {
  paymentNumber: string;
  date: string;
  lines: Array<{ method: string; amount: number; detail?: string }>;
  totalAmount: number;
}

export interface CollectionSummaryData {
  customerName: string;
  customerCode: string;
  soaNumber: string;
  period: string;
  soaTotal: number;
  payments: CollectionPayment[];
  soaBalance: number;
}

function fmt(v: number): string {
  return v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const METHOD_LABELS: Record<string, string> = { CASH: "Cash", CHECK: "Check", BANK_TRANSFER: "Bank Transfer", CREDIT_CARD: "Credit Card", GCASH: "GCash", MAYA: "Maya", QRPH: "QRPH", EWT: "EWT", OTHER: "Other" };

export function buildCollectionSummaryHtml(d: CollectionSummaryData): string {
  // Build payment rows
  let paymentRows = "";
  const methodTotals = new Map<string, number>();

  d.payments.forEach((p, idx) => {
    p.lines.forEach((line, lIdx) => {
      const label = METHOD_LABELS[line.method] ?? line.method;
      const detail = line.detail ? ` (${line.detail})` : "";
      methodTotals.set(line.method, (methodTotals.get(line.method) || 0) + line.amount);

      if (lIdx === 0) {
        paymentRows += `<tr>
          <td style="vertical-align:top">${idx + 1}</td>
          <td style="vertical-align:top">${fmtDate(p.date)}</td>
          <td style="vertical-align:top;font-family:monospace;font-weight:600">${esc(p.paymentNumber)}</td>
          <td>${esc(label)}${esc(detail)}</td>
          <td style="text-align:right">${fmt(line.amount)}</td>
        </tr>`;
      } else {
        paymentRows += `<tr>
          <td></td><td></td><td></td>
          <td>${esc(label)}${esc(detail)}</td>
          <td style="text-align:right">${fmt(line.amount)}</td>
        </tr>`;
      }
    });
  });

  // Method totals
  const totalCollected = d.payments.reduce((s, p) => s + p.totalAmount, 0);
  let methodTotalRows = "";
  for (const [method, total] of [...methodTotals].sort((a, b) => b[1] - a[1])) {
    const label = method === "EWT" ? "Total EWT" : `Total ${METHOD_LABELS[method] ?? method}`;
    methodTotalRows += `<tr><td colspan="4" style="text-align:right;color:#666">${label}:</td><td style="text-align:right">${fmt(total)}</td></tr>`;
  }

  const isPaid = d.soaBalance <= 0.01;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Collection Summary - ${esc(d.soaNumber)}</title>
<style>
@page { size: letter portrait; margin: 5mm 10mm 8mm 2.125in; }
body { font-family: Arial, sans-serif; font-size: 7.5pt; color: #000; margin: 0; padding: 0; line-height: 1.3; }
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
.header { font-family: 'Rockwell Extra Bold', Rockwell, Georgia, serif; font-weight: 900; font-size: 10.5pt; text-align: center; letter-spacing: 0.3px; line-height: 1.2; }
.title { text-align: center; font-weight: 700; font-size: 7.5pt; margin: 1px 0 4px; }
.info { margin-bottom: 4px; font-size: 7pt; line-height: 1.4; }
.info b { display: inline-block; width: 70px; }
hr { border: none; border-top: 1px solid #000; margin: 2px 0; }
table { width: 100%; border-collapse: collapse; font-size: 6.5pt; }
th { background: #f3f4f6; text-align: left; padding: 2px 3px; font-size: 6pt; font-weight: 700; text-transform: uppercase; border-bottom: 1px solid #000; }
th.right { text-align: right; }
th.center { text-align: center; }
td { padding: 1px 3px; border-bottom: 1px solid #eee; }
.total-row td { border-top: 1px solid #000; font-weight: 700; font-size: 7pt; padding-top: 3px; }
.balance { margin-top: 4px; font-size: 7.5pt; text-align: right; }
.balance .label { color: #666; }
.balance .value { font-weight: 900; }
.balance .paid { color: #059669; }
.bottom-section { margin-top: 4px; page-break-inside: avoid; }
.sig-table { width: 100%; border-collapse: collapse; font-size: 7pt; line-height: 1.8; table-layout: fixed; }
.sig-table td { border: none; padding: 0; overflow: hidden; }
.footer { font-size: 6pt; color: #666; margin-top: 2px; text-align: center; }
</style></head><body>

<div class="receipt">
<div class="content-section">
  <div class="header">C-BROS GENUINE AUTOPARTS &amp; ACCESSORIES, INC.</div>
  <div class="title">COLLECTION SUMMARY</div>

  <hr>

  <div class="info">
  <div><b>SOA #:</b> ${esc(d.soaNumber)}</div>
  <div><b>Customer:</b> ${esc(d.customerName)}</div>
  <div><b>Account:</b> ${esc(d.customerCode)}</div>
  <div><b>SOA Period:</b> ${esc(d.period)}</div>
  <div><b>SOA Total:</b> \u20B1${fmt(d.soaTotal)}</div>
  </div>

  <table>
  <thead>
  <tr><th class="center">#</th><th>Date</th><th>Receipt #</th><th>Method</th><th class="right">Amount</th></tr>
  </thead>
  <tbody>
  ${paymentRows}
  <tr><td colspan="5" style="border-bottom:none;height:2px"></td></tr>
  ${methodTotalRows}
  <tr class="total-row">
  <td colspan="4" style="text-align:right">Total Collected</td>
  <td style="text-align:right">\u20B1${fmt(totalCollected)}</td>
  </tr>
  </tbody>
  </table>

  <div class="balance">
  <span class="label">SOA Balance: </span>
  <span class="value ${isPaid ? "paid" : ""}">\u20B1${fmt(Math.max(0, d.soaBalance))}${isPaid ? "  \u2713 FULLY PAID" : ""}</span>
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
