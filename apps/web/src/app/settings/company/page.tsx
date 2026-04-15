"use client";

import { useState, useEffect } from "react";
import { Building2, Save, Loader2 } from "lucide-react";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import { useQuery, useMutation } from "@tanstack/react-query";

/* ─────────────────────────────────────────────
 * Types
 * ───────────────────────────────────────────── */

interface CompanySettings {
  legalName?: string;
  tin?: string;
  phone?: string;
  email?: string;
  address?: string;
  logoUrl?: string;
  invoiceTerms?: string;
  invoiceFooter?: string;
}

/* ─────────────────────────────────────────────
 * Page
 * ───────────────────────────────────────────── */

export default function CompanyProfilePage() {
  const { token, locationId } = useAuth();

  /* ── Fetch existing settings ── */
  const { data, isLoading } = useQuery({
    queryKey: ["company-settings"],
    queryFn: () =>
      apiFetch<{ data: CompanySettings }>("/settings/company", {
        token,
        locationId,
      }),
    enabled: !!token,
  });

  /* ── Form state ── */
  const [legalName, setLegalName] = useState("");
  const [tin, setTin] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [invoiceTerms, setInvoiceTerms] = useState("");
  const [invoiceFooter, setInvoiceFooter] = useState("");

  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  /* ── Populate form when data loads ── */
  useEffect(() => {
    if (data?.data) {
      const d = data.data;
      setLegalName(d.legalName ?? "");
      setTin(d.tin ?? "");
      setPhone(d.phone ?? "");
      setEmail(d.email ?? "");
      setAddress(d.address ?? "");
      setInvoiceTerms(d.invoiceTerms ?? "");
      setInvoiceFooter(d.invoiceFooter ?? "");
    }
  }, [data]);

  /* ── Save mutation ── */
  const saveMutation = useMutation({
    mutationFn: (body: CompanySettings) =>
      apiFetch<{ data: CompanySettings }>("/settings/company", {
        token,
        locationId,
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      setStatus({ type: "success", message: "Company profile saved successfully." });
      setTimeout(() => setStatus(null), 4000);
    },
    onError: (err: Error) => {
      setStatus({ type: "error", message: err.message || "Failed to save settings." });
    },
  });

  /* ── Submit handler ── */
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);

    // Build payload — only include non-empty fields
    const payload: CompanySettings = {};
    if (legalName.trim()) payload.legalName = legalName.trim();
    if (tin.trim()) payload.tin = tin.trim();
    if (phone.trim()) payload.phone = phone.trim();
    if (email.trim()) payload.email = email.trim();
    if (address.trim()) payload.address = address.trim();
    if (invoiceTerms.trim()) payload.invoiceTerms = invoiceTerms.trim();
    if (invoiceFooter.trim()) payload.invoiceFooter = invoiceFooter.trim();

    saveMutation.mutate(payload);
  }

  /* ── Loading state ── */
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Building2 size={20} className="text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Company Profile</h1>
          <p className="text-sm text-muted-foreground">
            Manage your company details for invoices and documents.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ── Business Information ── */}
        <div className="rounded-lg border border-border p-5 space-y-4">
          <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Business Information
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Legal Name */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Legal Name
              </label>
              <input
                type="text"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="Your Company Inc."
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>

            {/* TIN */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                TIN
              </label>
              <input
                type="text"
                value={tin}
                onChange={(e) => setTin(e.target.value)}
                placeholder="Tax Identification Number"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>

            {/* Phone */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Phone
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (555) 000-0000"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>

            {/* Email */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contact@company.com"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
          </div>
        </div>

        {/* ── Address ── */}
        <div className="rounded-lg border border-border p-5 space-y-4">
          <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Address
          </h2>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Business Address
            </label>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Street address, city, region, postal code..."
              rows={3}
              className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
        </div>

        {/* ── Invoice Settings ── */}
        <div className="rounded-lg border border-border p-5 space-y-4">
          <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Invoice Settings
          </h2>

          {/* Invoice Terms */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Invoice Terms
            </label>
            <textarea
              value={invoiceTerms}
              onChange={(e) => setInvoiceTerms(e.target.value)}
              placeholder="Payment terms, warranty info, etc."
              rows={4}
              className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          {/* Invoice Footer */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Invoice Footer
            </label>
            <input
              type="text"
              value={invoiceFooter}
              onChange={(e) => setInvoiceFooter(e.target.value)}
              placeholder="Thank you for your business!"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
        </div>

        {/* ── Status message ── */}
        {status && (
          <div
            className={`rounded-lg px-4 py-1.5 text-sm ${
              status.type === "success"
                ? "bg-emerald-500/10 text-emerald-600"
                : "bg-red-500/10 text-red-600"
            }`}
          >
            {status.message}
          </div>
        )}

        {/* ── Save button ── */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saveMutation.isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Save size={16} />
            )}
            Save Changes
          </button>
        </div>
      </form>
    </div>
  );
}
