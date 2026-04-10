/**
 * Generates a standalone HTML document for the CBROS Billing Statement.
 * Used with window.open() + document.write() for reliable printing.
 * Supports pagination: max 30 rows per page, all sections fit on letter size.
 */

interface SOACustomer {
  name: string;
  contactPerson: string | null;
  phone: string;
  email: string | null;
  address: string | null;
  paymentTermsDays: number;
}

interface SOATransaction {
  id: string;
  type: string;
  amount: string;
  balanceAfter: string;
  referenceNumber: string | null;
  notes: string | null;
  recordedAt: string;
}

interface SOAInput {
  customer: SOACustomer;
  transactions: SOATransaction[];
  openingBalance: number;
  closingBalance: number;
  from: string;
  to: string;
  soaNumber?: string;
}

/* ── Helpers ── */
function fmt(v: number): string {
  return v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const ROWS_PER_PAGE = 40;          // rows per page for multi-page SOAs
const MAX_SINGLE_PAGE_ROWS = 27;   // max data rows that fit on 1 page with all bottom sections

/* ── Main export ── */
export function buildSOAHtml(data: SOAInput): string {
  const c = data.customer;
  const f = new Date(data.from);
  const t = new Date(data.to);

  // Period
  let period: string, year: string;
  if (f.getFullYear() !== t.getFullYear()) {
    period = `${f.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} - ${t.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`;
    year = `${f.getFullYear()}-${t.getFullYear()}`;
  } else {
    period = `${f.toLocaleDateString("en-US", { month: "long", day: "numeric" })} - ${t.toLocaleDateString("en-US", { month: "long", day: "numeric" })}`;
    year = String(t.getFullYear());
  }

  const terms = c.paymentTermsDays === 0 ? "COD" : `Net ${c.paymentTermsDays}`;
  const phone = c.phone?.startsWith("AR-") ? "______________________________" : esc(c.phone || "");

  const charges = data.transactions.filter((x) => x.type === "CHARGE" || (x.type === "ADJUSTMENT" && parseFloat(x.amount) > 0));
  const credits = data.transactions.filter((x) => x.type === "PAYMENT" || x.type === "CREDIT_NOTE" || (x.type === "ADJUSTMENT" && parseFloat(x.amount) < 0));

  const chargeTotal = charges.reduce((s, x) => s + Math.abs(parseFloat(x.amount)), 0);
  const creditTotal = credits.reduce((s, x) => s + Math.abs(parseFloat(x.amount)), 0);
  const totalPayable = chargeTotal - creditTotal;

  // Single page if data fits within MAX_SINGLE_PAGE_ROWS, otherwise paginate at ROWS_PER_PAGE
  const singlePage = charges.length <= MAX_SINGLE_PAGE_ROWS;
  const totalPages = singlePage ? 1 : Math.max(1, Math.ceil(charges.length / ROWS_PER_PAGE));

  // Build pages
  let pages = "";
  for (let pg = 0; pg < totalPages; pg++) {
    const rowsThisPage = singlePage ? charges.length : ROWS_PER_PAGE;
    const startIdx = singlePage ? 0 : pg * ROWS_PER_PAGE;
    const pageCharges = charges.slice(startIdx, startIdx + rowsThisPage);
    const isFirst = pg === 0;
    const isLast = pg === totalPages - 1;
    // Filler rows: on single page, fill to MAX_SINGLE_PAGE_ROWS; on multi-page last page, no fillers
    const emptyCount = singlePage
      ? Math.max(0, MAX_SINGLE_PAGE_ROWS - pageCharges.length)
      : 0;

    // Charge rows
    const chargeRows = pageCharges.map((x) =>
      `<tr><td class="c">${fmtDate(x.recordedAt)}</td><td class="ct">${esc(x.referenceNumber || "Credit Sale")}</td><td class="r">${fmt(Math.abs(parseFloat(x.amount)))}</td></tr>`
    ).join("");
    const emptyRows = Array(emptyCount).fill('<tr><td class="e">&nbsp;</td><td class="e">&nbsp;</td><td class="e">&nbsp;</td></tr>').join("");

    // Header section
    const LB = 'style="border:none;border-bottom:1px solid #000;padding:1px 0"';
    const LN = 'style="border:none;padding:1px 0;font-weight:700;white-space:nowrap"';
    const header = isFirst ? `
<div class="hdr">C-BROS GENUINE AUTOPARTS &amp; ACCESSORIES, INC.</div>
<table style="width:100%;border-collapse:collapse;border:1px solid #000;margin-bottom:6px;font-size:8pt;table-layout:fixed">
<colgroup><col style="width:55%"><col style="width:45%"></colgroup>
<tr>
<td style="border-right:1px solid #000;padding:3px 6px;vertical-align:top">
<table style="width:100%;border:none;border-collapse:collapse;table-layout:fixed">
<colgroup><col style="width:130px"><col></colgroup>
<tr><td ${LN}>CUSTOMER:</td><td ${LB}><span style="font-size:10pt;font-weight:700">${esc(c.name)}</span></td></tr>
<tr><td ${LN}>CONTACT PERSON:</td><td ${LB}>${c.contactPerson ? esc(c.contactPerson) : "&nbsp;"}</td></tr>
<tr><td ${LN}>ADDRESS:</td><td ${LB}>${c.address ? esc(c.address) : "&nbsp;"}</td></tr>
<tr><td ${LN}>SALESMAN:</td><td ${LB}>&nbsp;</td></tr>
</table>
</td>
<td style="padding:3px 6px;vertical-align:top">
<table style="width:100%;border:none;border-collapse:collapse;table-layout:fixed">
<colgroup><col style="width:80px"><col></colgroup>
<tr><td ${LN}>TEL NOS:</td><td ${LB}>${c.phone?.startsWith("AR-") ? "&nbsp;" : esc(c.phone || "")}</td></tr>
<tr><td ${LN}>CEL NOS:</td><td ${LB}>${c.phone?.startsWith("AR-") ? "&nbsp;" : esc(c.phone || "")}</td></tr>
<tr><td ${LN}>EMAIL ADD:</td><td ${LB}>${c.email ? esc(c.email) : "&nbsp;"}</td></tr>
<tr><td ${LN}>TERMS:</td><td ${LB}>${terms}</td></tr>
</table>
</td>
</tr>
</table>
<div class="title">BILLING STATEMENT</div>${data.soaNumber ? `<div style="text-align:center;font-weight:700;font-size:9pt;margin-bottom:4px">SOA #: ${esc(data.soaNumber)}</div>` : ""}` : `
<div class="hdr-sm">C-BROS GENUINE AUTOPARTS &amp; ACCESSORIES, INC.</div>
<div style="font-size:8pt;text-align:center;margin-bottom:4px">${esc(c.name)} &mdash; ${esc(period)}, ${esc(year)}</div>
<div class="title" style="margin-top:4px">BILLING STATEMENT (continued)</div>`;

    // Footer sections (only on last page)
    let footer = "";
    if (isLast) {
      const creditRows = credits.map((x) =>
        `<tr><td class="c">${fmtDate(x.recordedAt)}</td><td class="ct">${esc(x.referenceNumber || x.type)}</td><td class="r">${fmt(Math.abs(parseFloat(x.amount)))}</td><td class="e">&nbsp;</td><td class="e">&nbsp;</td></tr>`
      ).join("");
      const emptyCr = Array(Math.max(0, 2 - credits.length)).fill('<tr><td class="e">&nbsp;</td><td class="e">&nbsp;</td><td class="e">&nbsp;</td><td class="e">&nbsp;</td><td class="e">&nbsp;</td></tr>').join("");

      footer = `
<div class="title" style="margin:4px 0 2px">CREDIT MEMO</div>
<table><thead><tr><th style="width:18%">DATE</th><th style="width:28%">REFERENCE INVOICE</th><th style="width:22%">AMOUNT</th><th style="width:16%">CHECKED BY</th><th style="width:16%">APPROVED BY</th></tr></thead>
<tbody>${creditRows}${emptyCr}
<tr class="tot"><td colspan="2" style="text-align:right">TOTAL</td><td class="r">${creditTotal > 0 ? fmt(creditTotal) : "\u2013"}</td><td class="e">&nbsp;</td><td class="e">&nbsp;</td></tr></tbody></table>

<table style="margin-top:4px"><tr class="tp"><td style="width:65%;text-align:right">TOTAL PAYABLE</td><td style="width:35%" class="r">\u20B1${fmt(totalPayable)}</td></tr></table>

<div style="text-align:center;font-size:7pt;font-weight:700;margin:2px 0;line-height:1.3">PLEASE MAKE CHECK PAYABLE TO C-BROS GENUINE AUTOPARTS &amp; ACCESSORIES, INC.<br>PAYMENTS WILL BE COLLECTED WITHIN 5 DAYS AFTER RECEIPT OF SOA.</div>

<table style="width:100%;border-collapse:collapse;margin-top:2px;font-size:7pt"><tr>
<td style="border:1px solid #000;padding:2px 4px;width:45%;vertical-align:top;line-height:1.4"><b>RECEIVED THE ABOVE STATEMENT OF ACCOUNT:</b><br>PRINTED NAME: ________________________<br>SIGNATURE: ________________________<br>DATE RECEIVED: ________________________</td>
<td style="border:1px solid #000;padding:2px 4px;width:30%;vertical-align:top;line-height:1.4"><b>PAYMENT DETAILS</b><br>CASH: ________________<br>CHECK: _______________<br>DATE: ________________</td>
<td style="border:1px solid #000;padding:2px 4px;width:25%;vertical-align:top;line-height:1.4"><b>RCVD BY:</b><br><br>________________________</td>
</tr></table>`;
    } else {
      footer = `<div style="text-align:right;font-size:7pt;color:#666;margin-top:2px">Continued on next page...</div>`;
    }

    const pageFooter = totalPages > 1 ? `<div class="pgf">Page ${pg + 1} of ${totalPages}</div>` : "";

    pages += `<div class="page">
${header}
<table>
<thead><tr><th style="text-align:left" colspan="2">MONTH/PERIOD: ${esc(period)}</th><th style="text-align:right">YEAR: ${esc(year)}</th></tr>
<tr><th style="width:28%">DATE</th><th style="width:37%">PARTICULARS</th><th style="width:35%">AMOUNT</th></tr></thead>
<tbody>${chargeRows}${emptyRows}
${isLast ? `<tr class="tot"><td colspan="2" style="text-align:right">TOTAL</td><td class="r">\u20B1${fmt(chargeTotal)}</td></tr>` : ""}
</tbody></table>
${footer}
${pageFooter}
</div>`;
  }

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Billing Statement - ${esc(c.name)}</title>
<style>
@page { size: letter portrait; margin: 20mm 10mm 8mm 10mm; }
body { font-family: Arial, sans-serif; font-size: 8.5pt; color: #000; margin: 0; padding: 0; background: #fff; }
table { border-collapse: collapse; width: 100%; }
td, th { border: 1px solid #000; padding: 2px 6px; font-size: 8.5pt; }
th { background: #e8e8e8; font-weight: 700; font-size: 8pt; }
.c { vertical-align: middle; }
.ct { vertical-align: middle; text-align: center; }
.r { text-align: right; font-family: 'Courier New', Courier, monospace; vertical-align: middle; }
.e { height: 15px; padding: 1px 6px; }
.tot td { font-weight: 700; font-size: 9pt; background: #e8e8e8; }
.tot .r { font-family: 'Courier New', Courier, monospace; }
.tp td { font-weight: 700; font-size: 10pt; background: #e8e8e8; }
.title { text-align: center; font-weight: 700; font-size: 11pt; margin: 4px 0 2px; }
.hdr { font-family: 'Rockwell Extra Bold', Rockwell, Georgia, serif; font-weight: 900; font-size: 15pt; text-align: center; letter-spacing: 0.5px; margin-bottom: 4px; }
.hdr-sm { font-family: 'Rockwell Extra Bold', Rockwell, Georgia, serif; font-weight: 900; font-size: 11pt; text-align: center; margin-bottom: 2px; }
.page { page-break-after: always; }
.page:last-child { page-break-after: auto; }
.pgf { text-align: center; font-size: 7pt; color: #666; margin-top: 3px; }
</style></head><body>${pages}</body></html>`;
}
