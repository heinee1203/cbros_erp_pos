"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import type { JobCardDetail } from "@/hooks/use-job-card-query";

/* ─── Currency helper ─── */
const formatPHP = (amount: number) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(amount);

/* ─── Page component ─── */
export default function InvoicePrintPage() {
  const { jobNo } = useParams<{ jobNo: string }>();
  const { token, locationId } = useAuth();

  const {
    data: job,
    isLoading: jobLoading,
    isError: jobError,
  } = useQuery<JobCardDetail>({
    queryKey: ["job-card", jobNo, locationId],
    queryFn: () =>
      apiFetch<JobCardDetail>(
        `/job-cards/by-number/${encodeURIComponent(jobNo)}`,
        { token, locationId },
      ),
    enabled: !!jobNo && !!token && !!locationId,
    staleTime: 10_000,
  });

  const { data: settingsRes } = useQuery<{ data: any }>({
    queryKey: ["company-settings"],
    queryFn: () =>
      apiFetch<{ data: any }>("/settings/company", { token, locationId }),
    enabled: !!token && !!locationId,
    staleTime: 60_000,
  });

  const settings = settingsRes?.data ?? {};

  /* ─── Loading ─── */
  if (jobLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  /* ─── Error ─── */
  if (jobError || !job) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-4 text-sm text-destructive">
          Job card not found. Please check the job number and try again.
        </div>
      </div>
    );
  }

  /* ─── Computed totals ─── */
  const laborTotal = job.laborLines.reduce(
    (sum, l) => sum + Number(l.lineTotal),
    0,
  );

  const usedParts = job.partLines.filter(
    (p) => p.issuedQty - p.returnedQty > 0,
  );

  const partsTotal = usedParts.reduce((sum, p) => {
    const net = p.issuedQty - p.returnedQty;
    return sum + net * Number(p.unitPrice);
  }, 0);

  const grandTotal = laborTotal + partsTotal;

  const invoiceDate = job.invoicedAt
    ? new Date(job.invoicedAt).toLocaleDateString("en-PH", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : new Date(job.createdAt).toLocaleDateString("en-PH", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

  const vehicleLabel = [job.vehicle.year, job.vehicle.make, job.vehicle.model]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="invoice-page mx-auto max-w-[210mm] bg-white p-10 text-foreground">
      {/* ─── Print Button ─── */}
      <button
        onClick={() => window.print()}
        className="no-print fixed top-6 right-6 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 shadow-lg"
      >
        <Printer size={16} />
        Print Invoice
      </button>

      {/* ─── Header ─── */}
      <div className="flex items-start justify-between">
        {/* Company info */}
        <div>
          <h1 className="text-2xl font-bold">
            {settings.legalName || "Your Company"}
          </h1>
          <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            {settings.address && <p>{settings.address}</p>}
            {settings.phone && <p>{settings.phone}</p>}
            {settings.email && <p>{settings.email}</p>}
            {settings.tin && <p>TIN: {settings.tin}</p>}
          </div>
        </div>

        {/* Invoice label */}
        <div className="text-right">
          <p className="text-3xl font-bold text-muted-foreground/30 tracking-widest">
            INVOICE
          </p>
          <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Job Card #:</span>{" "}
              {job.jobNo}
            </p>
            <p>
              <span className="font-medium text-foreground">Date:</span>{" "}
              {invoiceDate}
            </p>
            <p>
              <span className="font-medium text-foreground">Location:</span>{" "}
              {job.location.name}
            </p>
          </div>
        </div>
      </div>

      <hr className="border-border my-6" />

      {/* ─── Bill To / Vehicle ─── */}
      <div className="grid grid-cols-2 gap-8 text-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Bill To
          </p>
          <p className="mt-1 font-bold">{job.customer.name}</p>
          {job.customer.phone && (
            <p className="text-muted-foreground">{job.customer.phone}</p>
          )}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Vehicle
          </p>
          <p className="mt-1 font-bold">{vehicleLabel || "N/A"}</p>
          {job.vehicle.plateNo && (
            <p className="text-muted-foreground">
              Plate: {job.vehicle.plateNo}
            </p>
          )}
        </div>
      </div>

      {/* ─── Labor Lines ─── */}
      {job.laborLines.length > 0 && (
        <div className="mt-8">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-xs font-semibold text-muted-foreground">
                <th className="px-4 py-2.5 text-left">Description</th>
                <th className="px-4 py-2.5 text-right">Qty (hrs)</th>
                <th className="px-4 py-2.5 text-right">Rate</th>
                <th className="px-4 py-2.5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {job.laborLines.map((line) => (
                <tr key={line.id}>
                  <td className="px-4 py-2.5 border-b border-border">
                    {line.opCode} &mdash; {line.opName}
                    {line.description && (
                      <span className="block text-xs text-muted-foreground">
                        {line.description}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 border-b border-border text-right">
                    {Number(line.qtyHours).toFixed(2)}
                  </td>
                  <td className="px-4 py-2.5 border-b border-border text-right">
                    {formatPHP(Number(line.unitPrice))}
                  </td>
                  <td className="px-4 py-2.5 border-b border-border text-right">
                    {formatPHP(Number(line.lineTotal))}
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={3} className="px-4 py-2.5 text-right font-medium">
                  Subtotal
                </td>
                <td className="px-4 py-2.5 text-right font-medium">
                  {formatPHP(laborTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Parts Lines ─── */}
      {usedParts.length > 0 && (
        <div className="mt-8">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-xs font-semibold text-muted-foreground">
                <th className="px-4 py-2.5 text-left">Item</th>
                <th className="px-4 py-2.5 text-right">Qty</th>
                <th className="px-4 py-2.5 text-right">Unit Price</th>
                <th className="px-4 py-2.5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {usedParts.map((line) => {
                const net = line.issuedQty - line.returnedQty;
                const lineAmount = net * Number(line.unitPrice);
                return (
                  <tr key={line.id}>
                    <td className="px-4 py-2.5 border-b border-border">
                      {line.productName}{" "}
                      <span className="text-xs text-muted-foreground">
                        ({line.sku})
                      </span>
                    </td>
                    <td className="px-4 py-2.5 border-b border-border text-right">
                      {net}
                    </td>
                    <td className="px-4 py-2.5 border-b border-border text-right">
                      {formatPHP(Number(line.unitPrice))}
                    </td>
                    <td className="px-4 py-2.5 border-b border-border text-right">
                      {formatPHP(lineAmount)}
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td colSpan={3} className="px-4 py-2.5 text-right font-medium">
                  Subtotal
                </td>
                <td className="px-4 py-2.5 text-right font-medium">
                  {formatPHP(partsTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Totals ─── */}
      <div className="mt-8 flex justify-end">
        <div className="w-72 space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Labor Subtotal</span>
            <span>{formatPHP(laborTotal)}</span>
          </div>
          <div className="flex justify-between">
            <span>Parts Subtotal</span>
            <span>{formatPHP(partsTotal)}</span>
          </div>
          <hr className="border-border" />
          <div className="flex justify-between text-muted-foreground">
            <span>VAT</span>
            <span className="italic">(to be configured)</span>
          </div>
          <hr className="border-border" />
          <div className="flex justify-between text-lg font-bold">
            <span>GRAND TOTAL</span>
            <span>{formatPHP(grandTotal)}</span>
          </div>
        </div>
      </div>

      {/* ─── Payment Summary Placeholder ─── */}
      <div className="mt-8 rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
        <p className="font-medium">Payment Summary</p>
        <p className="mt-1">
          Payment details will appear here once payment processing is configured.
        </p>
      </div>

      {/* ─── Terms ─── */}
      <div className="mt-8 text-xs text-muted-foreground">
        <p className="font-semibold uppercase tracking-wider">
          Terms &amp; Conditions
        </p>
        <p className="mt-1">
          {settings.invoiceTerms ||
            "Terms and conditions will appear here once configured in Company Settings."}
        </p>
      </div>

      {/* ─── Footer ─── */}
      <div className="mt-8 border-t border-border pt-4 text-center text-xs text-muted-foreground">
        <p>{settings.invoiceFooter || "Thank you for your business!"}</p>
      </div>
    </div>
  );
}
