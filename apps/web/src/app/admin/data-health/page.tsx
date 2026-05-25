"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Database, Download, RefreshCw, Search } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/app/auth-context";
import { downloadCSV } from "@/lib/csv-export";
import { fmtPeso } from "@/lib/format";
import { cn } from "@/lib/utils";

type Severity = "critical" | "warning" | "info";

type DataHealthCategory =
  | "duplicate_customers"
  | "duplicate_suppliers"
  | "duplicate_products"
  | "profile_gaps"
  | "barcode_gaps"
  | "price_cost_gaps"
  | "negative_stock"
  | "inactive_balance"
  | "unlinked_documents"
  | "pending_rtv_deductions";

interface DataHealthIssue {
  id: string;
  category: DataHealthCategory;
  severity: Severity;
  owner: string;
  title: string;
  detail: string;
  value?: string;
  href: string;
}

type Row = Record<string, any>;

const CATEGORIES: Array<{ key: DataHealthCategory | "all"; label: string; description: string }> = [
  { key: "all", label: "All issues", description: "Everything found in the current scan" },
  { key: "duplicate_customers", label: "Duplicate customers", description: "Same TIN, code, phone, or normalized name" },
  { key: "duplicate_suppliers", label: "Duplicate suppliers", description: "Same TIN, bank account, phone, or normalized name" },
  { key: "duplicate_products", label: "Duplicate products", description: "Duplicate SKU, mnemonic SKU, or barcode" },
  { key: "profile_gaps", label: "Profile gaps", description: "Missing TIN, address, contact, or payment details" },
  { key: "barcode_gaps", label: "Barcode gaps", description: "Items missing sellable barcode identifiers" },
  { key: "price_cost_gaps", label: "Price/cost gaps", description: "Items with zero or missing selling price/cost" },
  { key: "negative_stock", label: "Negative stock", description: "Products with stock below zero" },
  { key: "inactive_balance", label: "Inactive with balance", description: "Inactive customers or suppliers with open balances" },
  { key: "unlinked_documents", label: "Unlinked documents", description: "Payments or documents without a clear SOA/document trace" },
  { key: "pending_rtv_deductions", label: "Pending RTV deductions", description: "Supplier returns still pending credit/deduction follow-up" },
];

function rowsFrom(response: unknown) {
  if (Array.isArray(response)) return response as Row[];
  const record = response && typeof response === "object" ? (response as Row) : {};
  for (const key of ["data", "items", "customers", "suppliers", "products", "rows"]) {
    if (Array.isArray(record[key])) return record[key] as Row[];
  }
  return [];
}

function normalizeKey(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function money(value: unknown) {
  const parsed = Number.parseFloat(String(value ?? "0"));
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function issueCountByCategory(issues: DataHealthIssue[], category: DataHealthCategory) {
  return issues.filter((issue) => issue.category === category).length;
}

function severityClass(severity: Severity) {
  if (severity === "critical") return "border-red-300 bg-red-50 text-red-900";
  if (severity === "warning") return "border-amber-300 bg-amber-50 text-amber-950";
  return "border-slate-300 bg-slate-50 text-slate-800";
}

function findDuplicates(rows: Row[], fields: string[]) {
  const duplicates = new Map<string, Row[]>();
  for (const field of fields) {
    const grouped = new Map<string, Row[]>();
    for (const row of rows) {
      const key = normalizeKey(row[field]);
      if (!key) continue;
      grouped.set(key, [...(grouped.get(key) ?? []), row]);
    }
    for (const [key, members] of grouped) {
      if (members.length > 1) duplicates.set(`${field}:${key}`, members);
    }
  }
  return duplicates;
}

function buildIssues({
  customers,
  suppliers,
  products,
  supplierReturns,
}: {
  customers: Row[];
  suppliers: Row[];
  products: Row[];
  supplierReturns: Row[];
}) {
  const issues: DataHealthIssue[] = [];

  for (const [key, members] of findDuplicates(customers, ["tin", "phone", "name"])) {
    const field = key.split(":")[0];
    for (const customer of members) {
      issues.push({
        id: `customer-duplicate-${field}-${customer.id}`,
        category: "duplicate_customers",
        severity: field === "tin" || field === "phone" ? "critical" : "warning",
        owner: text(customer.name) || "Unnamed customer",
        title: `Possible duplicate customer by ${field}`,
        detail: members.map((member) => text(member.name)).filter(Boolean).join(", "),
        value: text(customer.phone || customer.tin),
        href: `/customers/${customer.id}`,
      });
    }
  }

  for (const [key, members] of findDuplicates(suppliers, ["tin", "bankAccountNumber", "contactPhone", "name"])) {
    const field = key.split(":")[0];
    for (const supplier of members) {
      issues.push({
        id: `supplier-duplicate-${field}-${supplier.id}`,
        category: "duplicate_suppliers",
        severity: field === "tin" || field === "bankAccountNumber" ? "critical" : "warning",
        owner: text(supplier.name) || "Unnamed supplier",
        title: `Possible duplicate supplier by ${field}`,
        detail: members.map((member) => text(member.name)).filter(Boolean).join(", "),
        value: text(supplier.mnemonicCode || supplier.tin || supplier.bankAccountNumber),
        href: `/ap/suppliers?open=${encodeURIComponent(String(supplier.id))}`,
      });
    }
  }

  for (const [key, members] of findDuplicates(products, ["sku", "mnemonicSku", "barcode"])) {
    const field = key.split(":")[0];
    for (const product of members) {
      issues.push({
        id: `product-duplicate-${field}-${product.id}`,
        category: "duplicate_products",
        severity: field === "barcode" ? "critical" : "warning",
        owner: text(product.name) || "Unnamed item",
        title: `Duplicate product ${field}`,
        detail: members.map((member) => `${text(member.name)} (${text(member.sku || member.mnemonicSku)})`).join(", "),
        value: text(product[field]),
        href: `/inventory/${product.id}/edit`,
      });
    }
  }

  for (const customer of customers) {
    const missing = [
      !text(customer.address) && "address",
      !text(customer.tin) && "TIN",
      !text(customer.phone) && "phone/code",
      customer.customerType !== "INDIVIDUAL" && !text(customer.contactPerson) && "contact person",
    ].filter(Boolean) as string[];
    if (missing.length > 0) {
      issues.push({
        id: `customer-profile-${customer.id}`,
        category: "profile_gaps",
        severity: money(customer.currentBalance) > 0 ? "warning" : "info",
        owner: text(customer.name) || "Unnamed customer",
        title: "Customer profile incomplete",
        detail: `Missing ${missing.join(", ")}`,
        value: money(customer.currentBalance) > 0 ? fmtPeso(money(customer.currentBalance)) : undefined,
        href: `/customers/${customer.id}`,
      });
    }
    if (!customer.isActive && money(customer.currentBalance) > 0) {
      issues.push({
        id: `customer-inactive-balance-${customer.id}`,
        category: "inactive_balance",
        severity: "critical",
        owner: text(customer.name) || "Unnamed customer",
        title: "Inactive customer has open balance",
        detail: "Review account status before collection, SOA generation, or write-off.",
        value: fmtPeso(money(customer.currentBalance)),
        href: `/customers/${customer.id}`,
      });
    }
    if (money(customer.currentBalance) > 0 && (customer.documentCounts?.payments ?? 0) > 0 && (customer.documentCounts?.soaRecords ?? 0) === 0) {
      issues.push({
        id: `customer-unlinked-docs-${customer.id}`,
        category: "unlinked_documents",
        severity: "warning",
        owner: text(customer.name) || "Unnamed customer",
        title: "Payment/document trace needs review",
        detail: "Customer has payment document activity but no SOA document count in the list response.",
        href: `/customers/${customer.id}?tab=documents`,
      });
    }
  }

  for (const supplier of suppliers) {
    const missing = [
      !text(supplier.tin) && "TIN",
      !text(supplier.address) && "address",
      !text(supplier.contactPerson) && "contact person",
      !text(supplier.bankName) && "bank name",
      !text(supplier.bankAccountName) && "bank account name",
      !text(supplier.bankAccountNumber) && "bank account number",
    ].filter(Boolean) as string[];
    if (missing.length > 0) {
      issues.push({
        id: `supplier-profile-${supplier.id}`,
        category: "profile_gaps",
        severity: money(supplier.totalPayable) > 0 ? "warning" : "info",
        owner: text(supplier.name) || "Unnamed supplier",
        title: "Supplier profile incomplete",
        detail: `Missing ${missing.join(", ")}`,
        value: money(supplier.totalPayable) > 0 ? fmtPeso(money(supplier.totalPayable)) : undefined,
        href: `/ap/suppliers?open=${encodeURIComponent(String(supplier.id))}`,
      });
    }
    if (!supplier.isActive && money(supplier.totalPayable) > 0) {
      issues.push({
        id: `supplier-inactive-balance-${supplier.id}`,
        category: "inactive_balance",
        severity: "critical",
        owner: text(supplier.name) || "Unnamed supplier",
        title: "Inactive supplier has open payable",
        detail: "Review supplier status before SOA or disbursement voucher release.",
        value: fmtPeso(money(supplier.totalPayable)),
        href: `/ap/suppliers?open=${encodeURIComponent(String(supplier.id))}`,
      });
    }
  }

  for (const product of products) {
    const productHref = `/inventory/${product.id}/edit`;
    const barcodeMissing = !text(product.barcode) && !text(product.mnemonicSku);
    if (barcodeMissing && !product.discontinued) {
      issues.push({
        id: `product-barcode-${product.id}`,
        category: "barcode_gaps",
        severity: "warning",
        owner: text(product.name) || "Unnamed item",
        title: "Missing barcode / mnemonic SKU",
        detail: "Item may be hard to scan or identify at POS and receiving.",
        value: text(product.sku),
        href: productHref,
      });
    }
    if (money(product.unitPrice) <= 0 || money(product.costPrice) <= 0) {
      issues.push({
        id: `product-price-cost-${product.id}`,
        category: "price_cost_gaps",
        severity: money(product.unitPrice) <= 0 ? "critical" : "warning",
        owner: text(product.name) || "Unnamed item",
        title: "Price or cost is missing",
        detail: `Selling price ${fmtPeso(money(product.unitPrice))}; cost ${fmtPeso(money(product.costPrice))}`,
        value: text(product.sku),
        href: productHref,
      });
    }
    if (Number(product.stockLevel ?? 0) < 0) {
      issues.push({
        id: `product-negative-stock-${product.id}`,
        category: "negative_stock",
        severity: "critical",
        owner: text(product.name) || "Unnamed item",
        title: "Negative stock",
        detail: "Review sales, receiving, returns, and stock adjustments for this item.",
        value: String(product.stockLevel),
        href: productHref,
      });
    }
  }

  const pendingRtvStatuses = new Set(["SUBMITTED", "SUPPLIER_ACKNOWLEDGED", "CREDIT_PENDING", "DISPATCHED"]);
  for (const rtv of supplierReturns) {
    const creditAmount = money(rtv.creditAmount);
    const totalCost = money(rtv.totalCost);
    if (pendingRtvStatuses.has(String(rtv.status)) || (totalCost > 0 && creditAmount <= 0 && String(rtv.status) !== "CLOSED")) {
      issues.push({
        id: `pending-rtv-${rtv.id}`,
        category: "pending_rtv_deductions",
        severity: totalCost >= 10000 ? "critical" : "warning",
        owner: text(rtv.supplierName) || "Unnamed supplier",
        title: `${text(rtv.rtvNo) || "RTV"} pending deduction follow-up`,
        detail: `Status ${text(rtv.status)}; reason ${text(rtv.reason) || "not specified"}`,
        value: fmtPeso(totalCost || creditAmount),
        href: `/procurement/supplier-returns/${rtv.id}`,
      });
    }
  }

  return issues;
}

async function fetchCustomerRows(token: string, locationId: string) {
  const rows: Row[] = [];
  let cursor = "";
  for (let page = 0; page < 5; page += 1) {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const response = await apiFetch<Row>(`/customers?${qs.toString()}`, { token, locationId });
    rows.push(...rowsFrom(response));
    cursor = text(response.nextCursor);
    if (!response.hasMore || !cursor) break;
  }
  return rows;
}

async function fetchProductRows(token: string, locationId: string) {
  const rows: Row[] = [];
  for (let page = 1; page <= 5; page += 1) {
    const response = await apiFetch<Row>(`/products?page=${page}&limit=200&allLocations=true`, { token, locationId });
    rows.push(...rowsFrom(response));
    if (!response.hasMore) break;
  }
  return rows;
}

async function fetchSupplierReturnRows(token: string, locationId: string) {
  const rows: Row[] = [];
  let cursor = "";
  for (let page = 0; page < 5; page += 1) {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const response = await apiFetch<Row>(`/procurement/supplier-returns?${qs.toString()}`, { token, locationId });
    rows.push(...rowsFrom(response));
    cursor = text(response.nextCursor);
    if (!cursor) break;
  }
  return rows;
}

export default function DataHealthPage() {
  const { token, locationId, user } = useAuth();
  const [issues, setIssues] = useState<DataHealthIssue[]>([]);
  const [sourceErrors, setSourceErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<DataHealthCategory | "all">("all");
  const [search, setSearch] = useState("");

  const isAdmin = user?.role === "ADMIN";

  const filteredIssues = useMemo(() => {
    const query = search.trim().toLowerCase();
    return issues.filter((issue) => {
      const matchesCategory = selectedCategory === "all" || issue.category === selectedCategory;
      const matchesSearch = !query || `${issue.owner} ${issue.title} ${issue.detail} ${issue.value ?? ""}`.toLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [issues, search, selectedCategory]);

  const loadData = async () => {
    if (!token || !locationId || !isAdmin) return;
    setLoading(true);
    setSourceErrors([]);
    try {
      const [customerResult, supplierResult, productResult, rtvResult] = await Promise.allSettled([
        fetchCustomerRows(token, locationId),
        apiFetch<Row>("/ap/suppliers", { token, locationId }).then(rowsFrom),
        fetchProductRows(token, locationId),
        fetchSupplierReturnRows(token, locationId),
      ]);

      const errors: string[] = [];
      const customers = customerResult.status === "fulfilled" ? customerResult.value : [];
      const suppliers = supplierResult.status === "fulfilled" ? supplierResult.value : [];
      const products = productResult.status === "fulfilled" ? productResult.value : [];
      const supplierReturns = rtvResult.status === "fulfilled" ? rtvResult.value : [];

      if (customerResult.status === "rejected") errors.push(`Customers: ${customerResult.reason?.message ?? "failed"}`);
      if (supplierResult.status === "rejected") errors.push(`Suppliers: ${supplierResult.reason?.message ?? "failed"}`);
      if (productResult.status === "rejected") errors.push(`Products: ${productResult.reason?.message ?? "failed"}`);
      if (rtvResult.status === "rejected") errors.push(`Supplier returns: ${rtvResult.reason?.message ?? "failed"}`);

      setSourceErrors(errors);
      setIssues(buildIssues({ customers, suppliers, products, supplierReturns }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, locationId, isAdmin]);

  const exportIssues = () => {
    downloadCSV(
      selectedCategory === "all" ? "data-health-issues" : `data-health-${selectedCategory}`,
      ["Category", "Severity", "Owner", "Title", "Detail", "Value", "Repair Link"],
      filteredIssues.map((issue) => [
        issue.category,
        issue.severity,
        issue.owner,
        issue.title,
        issue.detail,
        issue.value ?? "",
        issue.href,
      ]),
    );
  };

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-background p-8 text-center shadow-sm">
        <AlertTriangle className="mx-auto text-amber-700" size={32} />
        <h1 className="mt-3 text-2xl font-bold">Admin only</h1>
        <p className="mt-2 text-sm text-muted-foreground">Data Health is read-only, but it exposes master-data and financial repair targets, so it is limited to admin users.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/[0.06] text-primary">
            <Database size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Data Health Center</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Read-only repair queue for duplicate records, profile gaps, stock issues, document trace gaps, and pending RTV deductions.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold shadow-sm hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw size={15} className={cn(loading && "animate-spin")} />
            Rescan
          </button>
          <button
            type="button"
            onClick={exportIssues}
            disabled={filteredIssues.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
          >
            <Download size={15} />
            Export CSV
          </button>
        </div>
      </div>

      {sourceErrors.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <span className="font-semibold">Partial scan:</span> {sourceErrors.join("; ")}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {CATEGORIES.map((category) => {
          const count = category.key === "all" ? issues.length : issueCountByCategory(issues, category.key);
          const active = selectedCategory === category.key;
          return (
            <button
              key={category.key}
              type="button"
              onClick={() => setSelectedCategory(category.key)}
              className={cn(
                "rounded-2xl border p-4 text-left shadow-sm transition-colors",
                active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted",
              )}
            >
              <div className="text-xs font-extrabold uppercase tracking-[0.12em] opacity-80">{category.label}</div>
              <div className="mt-2 text-3xl font-extrabold tabular-nums">{count}</div>
              <p className="mt-2 text-xs leading-5 opacity-80">{category.description}</p>
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-border bg-background shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <div className="relative min-w-[260px] flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search owner, issue, detail, value..."
              className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
            />
          </div>
          <div className="text-sm font-medium text-muted-foreground">
            {filteredIssues.length} visible issue{filteredIssues.length === 1 ? "" : "s"}
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Scanning current web ERP data...</div>
        ) : filteredIssues.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm font-semibold">No issues in this view</p>
            <p className="mt-1 text-sm text-muted-foreground">Try another category, search term, or rescan after data changes.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredIssues.map((issue) => (
              <div key={issue.id} className="grid gap-3 px-4 py-3 md:grid-cols-[140px_1fr_160px_120px] md:items-center">
                <div>
                  <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.08em]", severityClass(issue.severity))}>
                    {issue.severity}
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-foreground">{issue.owner}</p>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{issue.category.replace(/_/g, " ")}</span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-foreground">{issue.title}</p>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{issue.detail}</p>
                </div>
                <div className="text-sm font-bold tabular-nums text-foreground">{issue.value ?? "-"}</div>
                <Link href={issue.href} className="text-sm font-bold text-primary hover:underline">
                  Repair page
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
