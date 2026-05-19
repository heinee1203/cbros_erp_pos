/**
 * Generates a printable supplier disbursement voucher.
 */

export interface DVPaymentLine {
  paymentMethod: string;
  amount: number;
  referenceNumber?: string | null;
  bankName?: string | null;
  transactionDate?: string | null;
  platform?: string | null;
}

export interface DVDeductionLine {
  description: string;
  amount: number;
}

export interface DVAdditionalChargeLine {
  chargeType: string;
  description: string;
  referenceNumber?: string | null;
  amount: number;
}

export interface DVSoaRef {
  soaNumber: string;
  allocatedAmount: number;
  dateFrom?: string | null;
  dateTo?: string | null;
}

export interface DVData {
  dvNumber: string;
  supplierName: string;
  amount: number;
  grossAmount?: number;
  totalDeductions?: number;
  paymentDate: string;
  soaNumber?: string;
  soaDateFrom?: string;
  soaDateTo?: string;
  /** Multi-SOA references from junction table */
  soaRefs?: DVSoaRef[];
  remarks?: string | null;
  paymentMethod?: string;
  payments?: DVPaymentLine[];
  deductions?: DVDeductionLine[];
  additionalCharges?: DVAdditionalChargeLine[];
  invoices?: any[];
  /** Credit memos from the SOA (negative line items) shown in print breakdown */
  soaCreditMemos?: Array<{ invoiceNumber: string; amount: number }>;
  isVoided?: boolean;
  voidReason?: string | null;
}

const METHOD_LABELS: Record<string, string> = {
  CHECK: "Check",
  CASH: "Cash",
  BANK_TRANSFER: "Bank Transfer",
  ONLINE: "Online",
};

const SMALL_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];

const TENS_WORDS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function fmt(v: number): string {
  return v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function wordsBelowThousand(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${SMALL_WORDS[Math.floor(n / 100)]} hundred`);
    n %= 100;
  }
  if (n >= 20) {
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    parts.push(ones ? `${TENS_WORDS[tens]}-${SMALL_WORDS[ones]}` : TENS_WORDS[tens]);
  } else if (n > 0 || parts.length === 0) {
    parts.push(SMALL_WORDS[n]);
  }
  return parts.join(" ");
}

function numberToWords(n: number): string {
  if (n === 0) return "zero";
  const chunks: Array<[number, string]> = [
    [1_000_000_000, "billion"],
    [1_000_000, "million"],
    [1_000, "thousand"],
  ];
  const parts: string[] = [];
  for (const [value, label] of chunks) {
    if (n >= value) {
      parts.push(`${wordsBelowThousand(Math.floor(n / value))} ${label}`);
      n %= value;
    }
  }
  if (n > 0) parts.push(wordsBelowThousand(n));
  return parts.join(" ");
}

function amountInWords(amount: number): string {
  const pesos = Math.floor(Math.abs(amount));
  const cents = Math.round((Math.abs(amount) - pesos) * 100);
  const pesoWord = pesos === 1 ? "peso" : "pesos";
  const centText = cents > 0 ? ` and ${cents}/100` : "";
  return `${numberToWords(pesos)} ${pesoWord}${centText} only`.replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildPaymentRef(p: DVPaymentLine): string {
  if (p.paymentMethod === "CASH") return "Cash";
  if (p.paymentMethod === "ONLINE") {
    const platform = p.platform ?? "Online";
    return p.referenceNumber ? `${platform} #${p.referenceNumber}` : platform;
  }
  if (p.paymentMethod === "BANK_TRANSFER") {
    const bank = p.bankName ? `${p.bankName} ` : "";
    return p.referenceNumber ? `${bank}#${p.referenceNumber}` : p.bankName || "Bank transfer";
  }
  const bank = p.bankName ? `${p.bankName} ` : "";
  return p.referenceNumber ? `${bank}#${p.referenceNumber}` : p.bankName || "Check";
}

function periodText(from?: string | null, to?: string | null): string {
  if (!from || !to) return "";
  const f = from.slice(0, 10);
  const t = to.slice(0, 10);
  return f === t ? fmtDate(from) : `${fmtDate(from)} \u2013 ${fmtDate(to)}`;
}

export function buildDisbursementVoucherHtml(d: DVData): string {
  const gross = d.grossAmount ?? d.amount;
  const totalCMs = (d.soaCreditMemos ?? []).reduce((s, cm) => s + cm.amount, 0);
  const totalDed = d.totalDeductions ?? 0;
  const totalCharges = (d.additionalCharges ?? []).reduce((s, c) => s + c.amount, 0);
  const net = gross + totalCharges - totalCMs - totalDed;

  const paymentLines = d.payments && d.payments.length > 0
    ? d.payments
    : d.paymentMethod
      ? [{ paymentMethod: d.paymentMethod, amount: d.amount, referenceNumber: null, bankName: null, transactionDate: null, platform: null }]
      : [];
  const paymentTotal = paymentLines.reduce((sum, p) => sum + p.amount, 0);

  const payRows = paymentLines.map((p) => {
    const dt = p.transactionDate ? fmtDate(p.transactionDate) : fmtDate(d.paymentDate);
    return `<tr>
      <td>${esc(METHOD_LABELS[p.paymentMethod] ?? p.paymentMethod)}</td>
      <td>${esc(buildPaymentRef(p))}</td>
      <td>${dt}</td>
      <td class="right">${fmt(p.amount)}</td>
    </tr>`;
  }).join("\n");

  const deductionLines = [
    ...(d.soaCreditMemos ?? []).map((cm) => ({
      label: `Credit memo ${cm.invoiceNumber}`,
      amount: cm.amount,
    })),
    ...(d.deductions ?? []).map((deduction) => ({
      label: deduction.description,
      amount: deduction.amount,
    })),
  ];

  const chargeLines = (d.additionalCharges ?? []).map((charge) => ({
    label: `${charge.description}${charge.referenceNumber ? ` (${charge.referenceNumber})` : ""}`,
    amount: charge.amount,
  }));

  const soaRefs = d.soaRefs && d.soaRefs.length > 0
    ? d.soaRefs
    : d.soaNumber
      ? [{ soaNumber: d.soaNumber, allocatedAmount: gross, dateFrom: d.soaDateFrom, dateTo: d.soaDateTo }]
      : [];

  const soaRows = soaRefs.map((r) => {
    const period = periodText(r.dateFrom, r.dateTo);
    return `<tr>
      <td><span class="mono strong">${esc(r.soaNumber.replace(/^SUPP-SOA-/, ""))}</span>${period ? `<div class="sub">${period}</div>` : ""}</td>
      <td class="right">${fmt(r.allocatedAmount)}</td>
    </tr>`;
  }).join("\n");

  const chargeRows = chargeLines.map((line) =>
    `<div class="recon-row add"><span>+ ${esc(line.label)}</span><span>${fmt(line.amount)}</span></div>`
  ).join("\n");

  const deductionRows = deductionLines.map((line) =>
    `<div class="recon-row less"><span>&minus; ${esc(line.label)}</span><span>(${fmt(line.amount)})</span></div>`
  ).join("\n");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>DV - ${esc(d.dvNumber)}</title>
<style>
@page { size: letter portrait; margin: 10mm; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #111827; }
.dv-page { min-height: 5in; display: flex; flex-direction: column; }
.company { font-family: 'Rockwell Extra Bold', Rockwell, Georgia, serif; font-weight: 900; font-size: 14pt; text-align: center; letter-spacing: 0.3px; padding-top: 4px; white-space: nowrap; }
.doc-title { text-align: center; font-weight: 800; font-size: 13pt; text-transform: uppercase; margin: 2px 0 14px; letter-spacing: 0.06em; }
.top-grid { display: grid; grid-template-columns: 1fr 220px; gap: 14px; margin-bottom: 12px; }
.panel { border: 1px solid #d1d5db; border-radius: 8px; padding: 9px 10px; }
.panel-label { color: #4b5563; font-size: 8pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; }
.payto-name { font-size: 13pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.3px; }
.meta-row { display: flex; justify-content: space-between; gap: 12px; line-height: 1.55; }
.meta-row b { color: #4b5563; font-weight: 600; }
.mono { font-family: 'Courier New', monospace; }
.strong { font-weight: 800; }
.body-grid { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 12px; align-items: start; }
.section-title { font-size: 8pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 5px; color: #374151; }
table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
th { text-align: left; font-size: 7.5pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; padding: 5px 6px; border-top: 2px solid #111827; border-bottom: 2px solid #111827; background: #f3f4f6; }
td { padding: 5px 6px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
.right { text-align: right; font-variant-numeric: tabular-nums; }
.sub { color: #6b7280; font-size: 7.5pt; margin-top: 1px; }
.total-line td { border-top: 2px solid #111827; border-bottom: 3px double #111827; font-weight: 900; background: #fff; }
.amount-words { margin-top: 8px; border: 1px solid #d1d5db; border-radius: 8px; padding: 7px 9px; font-size: 8.5pt; line-height: 1.35; }
.amount-words b { display: block; color: #4b5563; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 2px; }
.recon { border: 1px solid #d1d5db; border-radius: 8px; padding: 8px 10px; font-size: 8.8pt; line-height: 1.45; }
.recon-row { display: flex; justify-content: space-between; gap: 10px; padding: 1px 0; }
.recon-row span:last-child { font-variant-numeric: tabular-nums; white-space: nowrap; }
.add { color: #047857; }
.less { color: #b91c1c; }
.recon-rule { border-top: 1px solid #111827; margin: 4px 0; }
.recon-total { font-size: 10pt; font-weight: 900; }
.remarks { margin-top: 8px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 7px 9px; color: #4b5563; font-size: 8.5pt; line-height: 1.35; }
.spacer { flex: 1; }
.sig { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-top: 16mm; font-size: 9pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.03em; }
.sig-line { border-bottom: 1px solid #111827; height: 24px; margin-top: 4px; }
.footer { margin-top: 12px; margin-bottom: 4mm; font-size: 8pt; color: #6b7280; text-align: center; }
.voided-watermark { position: fixed; top: 35%; left: 50%; transform: translate(-50%, -50%) rotate(-35deg); font-size: 94pt; font-weight: 900; color: rgba(220, 38, 38, 0.12); letter-spacing: 16px; pointer-events: none; z-index: 1; }
</style></head><body>

${d.isVoided ? '<div class="voided-watermark">VOIDED</div>' : ""}
<div class="dv-page">
  <div class="company">C-BROS GENUINE AUTOPARTS &amp; ACCESSORIES, INC.</div>
  <div class="doc-title">Disbursement Voucher</div>

  <div class="top-grid">
    <div class="panel">
      <div class="panel-label">Pay To</div>
      <div class="payto-name">${esc(d.supplierName)}</div>
    </div>
    <div class="panel">
      <div class="meta-row"><b>Date</b><span>${fmtDate(d.paymentDate)}</span></div>
      <div class="meta-row"><b>DV #</b><span class="mono strong">${esc(d.dvNumber)}</span></div>
      <div class="meta-row"><b>Status</b><span>${d.isVoided ? "Voided" : "For payment"}</span></div>
    </div>
  </div>

  <div class="body-grid">
    <div>
      <div class="section-title">Payment Details</div>
      <table>
        <thead><tr>
          <th style="width:22%">Mode</th>
          <th style="width:34%">Reference</th>
          <th style="width:20%">Date</th>
          <th class="right" style="width:24%">Amount</th>
        </tr></thead>
        <tbody>
          ${payRows || `<tr><td colspan="4" class="sub" style="text-align:center;padding:14px">No payment lines.</td></tr>`}
          <tr class="total-line"><td colspan="3" class="right">Payment Total</td><td class="right">${fmt(paymentTotal)}</td></tr>
        </tbody>
      </table>

      <div class="amount-words">
        <b>Amount in words</b>
        ${esc(amountInWords(net))}
      </div>
    </div>

    <div>
      <div class="section-title">SOA Details</div>
      <table>
        <thead><tr><th>SOA #</th><th class="right">Amount</th></tr></thead>
        <tbody>
          ${soaRows || `<tr><td colspan="2" class="sub" style="text-align:center;padding:12px">No SOA linked.</td></tr>`}
        </tbody>
      </table>

      <div class="recon" style="margin-top:8px">
        <div class="recon-row"><span>SOA gross amount</span><span>${fmt(gross)}</span></div>
        ${chargeRows}
        ${deductionRows}
        <div class="recon-rule"></div>
        <div class="recon-row recon-total"><span>Net Payment</span><span>&#8369;${fmt(net)}</span></div>
      </div>

      ${d.remarks ? `<div class="remarks"><b>Remarks:</b> ${esc(d.remarks)}</div>` : ""}
      ${d.isVoided && d.voidReason ? `<div class="remarks"><b>Void reason:</b> ${esc(d.voidReason)}</div>` : ""}
    </div>
  </div>

  <div class="spacer"></div>

  <div class="sig">
    <div>
      <div>Prepared by</div>
      <div class="sig-line"></div>
    </div>
    <div>
      <div>Checked by</div>
      <div class="sig-line"></div>
    </div>
    <div>
      <div>Received by</div>
      <div class="sig-line"></div>
    </div>
  </div>

  <div class="footer">This is a computer-generated document. Verify SOA details and payment references before release.</div>
</div>

</body></html>`;
}
