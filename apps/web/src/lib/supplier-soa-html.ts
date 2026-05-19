/**
 * Generates a printable supplier statement of account.
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
   * Optional persistent SOA number (e.g. "SUPP-SOA-2026-0001") rendered in
   * the info block when present. Omitted for ephemeral preview prints.
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

function daysPastDue(dueDate: string): number {
  return Math.floor((Date.now() - new Date(dueDate).getTime()) / 86400000);
}

function ageLabel(days: number): string {
  if (days <= 0) return "Current";
  if (days === 1) return "1 day";
  return `${days} days`;
}

function moneyCell(value: number, options?: { strong?: boolean; danger?: boolean }): string {
  const classes = [
    "money",
    options?.strong ? "strong" : "",
    options?.danger ? "danger" : "",
  ].filter(Boolean).join(" ");
  return `<span class="${classes}">${fmt(value)}</span>`;
}

export function buildSupplierSOAHtml(d: SupplierSOAData): string {
  const sorted = [...(d.invoices || [])].sort((a, b) => new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime());
  const totalInvoiced = sorted.reduce((s, i) => s + i.totalAmount, 0);
  const totalPaid = sorted.reduce((s, i) => s + i.paidAmount, 0);
  const totalBalance = sorted.reduce((s, i) => s + i.balance, 0);
  const overdueBalance = sorted.reduce((s, i) => s + (daysPastDue(i.dueDate) > 0 ? i.balance : 0), 0);
  const currentBalance = Math.max(totalBalance - overdueBalance, 0);

  const dateRange = sorted.length > 0
    ? `${fmtDate(sorted[0].invoiceDate)} \u2013 ${fmtDate(sorted[sorted.length - 1].invoiceDate)}`
    : "";

  const now = new Date();

  const rows = sorted.map((inv) => {
    const ageDays = daysPastDue(inv.dueDate);
    const isOverdue = ageDays > 0;
    return `<tr>
<td>${fmtDate(inv.invoiceDate)}</td>
<td>${fmtDate(inv.dueDate)}</td>
<td class="mono strong">${esc(inv.invoiceNumber)}</td>
<td class="right">${moneyCell(inv.totalAmount)}</td>
<td class="right">${moneyCell(inv.paidAmount)}</td>
<td class="right">${moneyCell(inv.balance, { strong: true, danger: isOverdue })}</td>
<td class="right ${isOverdue ? "danger strong" : "muted"}">${ageLabel(ageDays)}</td>
</tr>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Supplier SOA - ${esc(d.supplierName)}</title>
<style>
@page { size: letter portrait; margin: 12mm; }
* { box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 9.5pt; color: #111827; margin: 0; padding: 0; }
.page { min-height: 252mm; display: flex; flex-direction: column; }
.brand { text-align: center; margin-bottom: 14px; }
.company { font-family: 'Rockwell Extra Bold', Rockwell, Georgia, serif; font-weight: 900; font-size: 15pt; letter-spacing: 0.5px; }
.title { margin-top: 2px; font-size: 12pt; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
.meta-grid { display: grid; grid-template-columns: 1fr 240px; gap: 14px; margin-bottom: 12px; }
.box { border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 12px; }
.supplier-name { font-size: 12pt; font-weight: 800; margin-bottom: 6px; }
.kv { display: grid; grid-template-columns: 78px 1fr; gap: 4px 10px; line-height: 1.45; }
.kv b { color: #4b5563; font-weight: 700; }
.mono { font-family: 'Courier New', monospace; }
.summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; }
.metric { border: 1px solid #d1d5db; border-radius: 8px; padding: 8px 10px; }
.metric-label { color: #6b7280; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; }
.metric-value { margin-top: 3px; font-size: 11pt; font-weight: 800; font-variant-numeric: tabular-nums; }
.danger { color: #b91c1c; }
.muted { color: #6b7280; }
.strong { font-weight: 800; }
table { width: 100%; border-collapse: collapse; font-size: 8.6pt; }
thead { display: table-header-group; }
th { background: #f3f4f6; text-align: left; padding: 6px 7px; font-size: 7.5pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; border-top: 2px solid #111827; border-bottom: 2px solid #111827; }
td { padding: 5px 7px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
tbody tr:nth-child(even) td { background: #fafafa; }
.right { text-align: right; }
.money { font-variant-numeric: tabular-nums; }
.total-row td { border-top: 2px solid #111827; border-bottom: 3px double #111827; background: #fff; font-weight: 800; font-size: 9.5pt; padding-top: 8px; }
.notes { margin-top: 12px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 10px; color: #4b5563; font-size: 8pt; line-height: 1.4; }
.spacer { flex: 1; }
.sig-section { margin-top: 26px; display: grid; grid-template-columns: 1fr 1fr; gap: 28px; font-size: 9pt; }
.sig-label { margin-bottom: 18px; font-weight: 700; }
.sig-line { border-bottom: 1px solid #111827; height: 1px; }
.footer { margin-top: 18px; font-size: 7.5pt; color: #6b7280; text-align: center; }
</style></head><body>

<div class="page">
  <div class="brand">
    <div class="company">C-BROS GENUINE AUTOPARTS &amp; ACCESSORIES, INC.</div>
    <div class="title">Supplier Statement of Account</div>
  </div>

  <div class="meta-grid">
    <div class="box">
      <div class="supplier-name">${esc(d.supplierName)}</div>
      <div class="kv">
        <b>Period</b><span>${dateRange || "No invoices"}</span>
        <b>Invoices</b><span>${sorted.length.toLocaleString("en-PH")}</span>
      </div>
    </div>
    <div class="box">
      <div class="kv">
        ${d.soaNumber ? `<b>SOA #</b><span class="mono strong">${esc(d.soaNumber.replace(/^SUPP-SOA-/, ""))}</span>` : ""}
        <b>Date</b><span>${fmtDate(now.toISOString())}</span>
        <b>Status</b><span>${overdueBalance > 0 ? `<span class="danger strong">With overdue invoices</span>` : "Current"}</span>
      </div>
    </div>
  </div>

  <div class="summary">
    <div class="metric"><div class="metric-label">Total Invoiced</div><div class="metric-value">${fmt(totalInvoiced)}</div></div>
    <div class="metric"><div class="metric-label">Paid / Applied</div><div class="metric-value">${fmt(totalPaid)}</div></div>
    <div class="metric"><div class="metric-label">Current Balance</div><div class="metric-value">${fmt(currentBalance)}</div></div>
    <div class="metric"><div class="metric-label">Overdue Balance</div><div class="metric-value danger">${fmt(overdueBalance)}</div></div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:12%">Invoice Date</th>
        <th style="width:12%">Due Date</th>
        <th style="width:18%">Invoice #</th>
        <th class="right" style="width:14%">Invoice Amount</th>
        <th class="right" style="width:14%">Paid</th>
        <th class="right" style="width:16%">Balance</th>
        <th class="right" style="width:14%">Age</th>
      </tr>
    </thead>
    <tbody>
      ${rows || `<tr><td colspan="7" class="muted" style="text-align:center;padding:18px">No invoices selected.</td></tr>`}
      <tr class="total-row">
        <td colspan="5" class="right">TOTAL BALANCE</td>
        <td class="right">${fmt(totalBalance)}</td>
        <td></td>
      </tr>
    </tbody>
  </table>

  <div class="notes">
    Please verify invoices, credit memos, and any partial payments before issuing payment. This statement reflects the selected supplier invoices at the time it was generated.
  </div>

  <div class="spacer"></div>

  <div class="sig-section">
    <div>
      <div class="sig-label">Prepared by</div>
      <div class="sig-line"></div>
    </div>
    <div>
      <div class="sig-label">Approved by</div>
      <div class="sig-line"></div>
    </div>
  </div>

  <div class="footer">This is a computer-generated document.</div>
</div>

</body></html>`;
}
