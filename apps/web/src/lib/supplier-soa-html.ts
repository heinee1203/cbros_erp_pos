/**
 * Generates a printable Supplier Statement of Account (letter portrait).
 */

export interface SupplierSOAData {
  supplierName: string;
  invoices: Array<{
    invoiceNumber: string;
    invoiceDate: string;
    dueDate: string;
    totalAmount: number;
    paidAmount: number;
    balance: number;
  }>;
  /**
   * Optional persistent SOA number (e.g. "SUPP-SOA-2026-0001") — rendered
   * in the info block when present. Omitted for ephemeral "Preview All" prints.
   */
  soaNumber?: string;
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

export function buildSupplierSOAHtml(d: SupplierSOAData): string {
  const sorted = [...d.invoices].sort((a, b) => new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime());
  const totalAmount = sorted.reduce((s, i) => s + i.totalAmount, 0);
  const totalPaid = sorted.reduce((s, i) => s + i.paidAmount, 0);
  const totalBalance = sorted.reduce((s, i) => s + i.balance, 0);

  const dateRange = sorted.length > 0
    ? `${fmtDate(sorted[0].invoiceDate)} \u2013 ${fmtDate(sorted[sorted.length - 1].invoiceDate)}`
    : "";

  const now = new Date();

  const rows = sorted.map((inv) => {
    const isOverdue = new Date(inv.dueDate) < now && inv.balance > 0;
    const dueDateStyle = isOverdue ? 'style="color:#dc2626;font-weight:600"' : '';
    return `<tr>
<td style="font-family:monospace;font-weight:600">${esc(inv.invoiceNumber)}</td>
<td>${fmtDate(inv.invoiceDate)}</td>
<td ${dueDateStyle}>${fmtDate(inv.dueDate)}</td>
<td style="text-align:right">${fmt(inv.totalAmount)}</td>
<td style="text-align:right">${fmt(inv.paidAmount)}</td>
<td style="text-align:right;font-weight:600">${fmt(inv.balance)}</td>
</tr>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Supplier SOA - ${esc(d.supplierName)}</title>
<style>
@page { size: letter portrait; margin: 15mm 12mm; }
body { font-family: Arial, sans-serif; font-size: 10pt; color: #000; margin: 0; padding: 0; }
.header { font-family: 'Rockwell Extra Bold', Rockwell, Georgia, serif; font-weight: 900; font-size: 14pt; text-align: center; letter-spacing: 0.5px; }
.title { text-align: center; font-weight: 700; font-size: 12pt; margin: 4px 0 16px; }
.info { margin-bottom: 16px; font-size: 10pt; line-height: 1.6; }
.info b { display: inline-block; width: 80px; }
table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
th { background: #f3f4f6; text-align: left; padding: 6px 8px; font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; border-bottom: 2px solid #000; }
th.right { text-align: right; }
td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; }
.total-row td { border-top: 2px solid #000; font-weight: 700; font-size: 10pt; padding-top: 8px; }
.sig-section { margin-top: 40px; font-size: 9pt; line-height: 2.2; }
.footer { margin-top: 24px; font-size: 7.5pt; color: #666; text-align: center; }
</style></head><body>

<div class="header">C-BROS GENUINE AUTOPARTS &amp; ACCESSORIES, INC.</div>
<div class="title">SUPPLIER STATEMENT OF ACCOUNT</div>

<div class="info">
<div><b>Supplier:</b> ${esc(d.supplierName)}</div>
${d.soaNumber ? `<div><b>SOA #:</b> <span style="font-family:monospace;font-weight:700">${esc(d.soaNumber)}</span></div>` : ""}
<div><b>Period:</b> ${dateRange}</div>
<div><b>Date:</b> ${fmtDate(now.toISOString())}</div>
</div>

<table>
<thead>
<tr>
<th>Invoice #</th>
<th>Date</th>
<th>Due Date</th>
<th class="right">Amount</th>
<th class="right">Paid</th>
<th class="right">Balance</th>
</tr>
</thead>
<tbody>
${rows}
<tr class="total-row">
<td colspan="3" style="text-align:right">TOTAL</td>
<td style="text-align:right">${fmt(totalAmount)}</td>
<td style="text-align:right">${fmt(totalPaid)}</td>
<td style="text-align:right">${fmt(totalBalance)}</td>
</tr>
</tbody>
</table>

<div class="sig-section">
<table style="width:100%;border:none">
<tr><td style="border:none;width:50%">Prepared by: ______________________________________</td><td style="border:none">Approved by: ______________________________________</td></tr>
<tr><td style="border:none">Date: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;______________________________________</td><td style="border:none">Date: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;______________________________________</td></tr>
</table>
</div>

<div class="footer">This is a computer-generated document.</div>

</body></html>`;
}
