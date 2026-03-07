"use client";

import { useState } from "react";

type Tab = "quick" | "full";

export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState<Tab>("quick");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  return (
    <div className="flex h-full gap-0">
      {/* Main content area */}
      <div className={`flex-1 transition-all ${selectedProductId ? "mr-96" : ""}`}>
        <div className="mb-6">
          <h2 className="text-lg font-semibold">Inventory Manager</h2>
          <p className="text-sm text-muted-foreground">
            Browse and manage 50,000+ automotive parts across all locations
          </p>
        </div>

        {/* Tabs */}
        <div className="mb-4 flex gap-1 rounded-lg bg-muted p-1">
          <TabButton
            active={activeTab === "quick"}
            onClick={() => setActiveTab("quick")}
            icon="⚡"
            label="Quick Search"
          />
          <TabButton
            active={activeTab === "full"}
            onClick={() => setActiveTab("full")}
            icon="📋"
            label="Full Inventory"
          />
        </div>

        {/* Shared search bar */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search by mnemonic code, SKU, or product name..."
            className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/20"
            autoFocus
          />
        </div>

        {/* Tab content */}
        {activeTab === "quick" ? (
          <QuickSearchView onSelectProduct={setSelectedProductId} />
        ) : (
          <FullInventoryView onSelectProduct={setSelectedProductId} />
        )}
      </div>

      {/* Detail Drawer */}
      {selectedProductId && (
        <DetailDrawer
          productId={selectedProductId}
          onClose={() => setSelectedProductId(null)}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon} {label}
    </button>
  );
}

function QuickSearchView({
  onSelectProduct,
}: {
  onSelectProduct: (id: string) => void;
}) {
  // Placeholder cards — will use shared useInventorySearch() hook
  const mockProducts = [
    { id: "1", name: "Hankook All-Season 225/45R17", sku: "TIR-001234", mnemonic: "KSGTIANKLO", category: "TIRES", stock: 24, price: "4,850.00", status: "in-stock" as const },
    { id: "2", name: "Mobil 1 Full Synthetic 5W-30 4L", sku: "LUB-005678", mnemonic: "OGKSIUTNAL", category: "LUBRICANTS", stock: 3, price: "1,250.00", status: "low" as const },
    { id: "3", name: "Bosch Brake Pad Set - Toyota Camry", sku: "HAR-009012", mnemonic: "TKLSOINGAU", category: "HARD_PARTS", stock: 0, price: "2,100.00", status: "out" as const },
  ];

  return (
    <div className="grid gap-3">
      {mockProducts.map((p) => (
        <button
          key={p.id}
          onClick={() => onSelectProduct(p.id)}
          className="flex items-center justify-between rounded-lg border border-border p-4 text-left transition-colors hover:bg-accent"
        >
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{p.name}</span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                {p.category}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
              <span>SKU: {p.sku}</span>
              <span>Mnemonic: {p.mnemonic}</span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-right">
            <div>
              <div className="text-sm font-medium">PHP {p.price}</div>
              <StockBadge stock={p.stock} status={p.status} />
            </div>
            <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>
      ))}
    </div>
  );
}

function FullInventoryView({
  onSelectProduct,
}: {
  onSelectProduct: (id: string) => void;
}) {
  const mockData = [
    { id: "1", name: "Hankook All-Season 225/45R17", sku: "TIR-001234", mnemonic: "KSGTIANKLO", category: "TIRES", stock: 24, reorder: 10, price: "4,850.00" },
    { id: "2", name: "Mobil 1 Full Synthetic 5W-30 4L", sku: "LUB-005678", mnemonic: "OGKSIUTNAL", category: "LUBRICANTS", stock: 3, reorder: 5, price: "1,250.00" },
    { id: "3", name: "Bosch Brake Pad Set - Toyota Camry", sku: "HAR-009012", mnemonic: "TKLSOINGAU", category: "HARD_PARTS", stock: 0, reorder: 5, price: "2,100.00" },
    { id: "4", name: "Nitto Mud-Terrain 265/70R17", sku: "TIR-003456", mnemonic: "UTISNKGOLA", category: "TIRES", stock: 15, reorder: 8, price: "7,200.00" },
    { id: "5", name: "Castrol Synthetic Blend 10W-40 5L", sku: "LUB-007890", mnemonic: "ANKLGIUSTO", category: "LUBRICANTS", stock: 42, reorder: 10, price: "980.00" },
  ];

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Product</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">SKU</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Mnemonic</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Category</th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Stock</th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Reorder</th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Unit Price</th>
          </tr>
        </thead>
        <tbody>
          {mockData.map((p, i) => (
            <tr
              key={p.id}
              onClick={() => onSelectProduct(p.id)}
              className={`cursor-pointer border-b border-border transition-colors hover:bg-accent ${
                i % 2 === 0 ? "bg-background" : "bg-muted/20"
              }`}
            >
              <td className="px-4 py-3 font-medium">{p.name}</td>
              <td className="px-4 py-3 text-muted-foreground">{p.sku}</td>
              <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.mnemonic}</td>
              <td className="px-4 py-3">
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{p.category}</span>
              </td>
              <td className="px-4 py-3 text-right">
                <StockBadge
                  stock={p.stock}
                  status={p.stock === 0 ? "out" : p.stock <= p.reorder ? "low" : "in-stock"}
                />
              </td>
              <td className="px-4 py-3 text-right text-muted-foreground">{p.reorder}</td>
              <td className="px-4 py-3 text-right font-medium">PHP {p.price}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Pagination */}
      <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-3">
        <span className="text-xs text-muted-foreground">Showing 1-50 of 50,000 products</span>
        <div className="flex gap-2">
          <button className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent" disabled>
            Previous
          </button>
          <button className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent">
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailDrawer({
  productId,
  onClose,
}: {
  productId: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-y-0 right-0 z-50 w-96 border-l border-border bg-background shadow-lg">
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h3 className="text-sm font-semibold">Product Details</h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Product info section */}
          <section className="mb-6">
            <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Information
            </h4>
            <div className="space-y-2 text-sm">
              <InfoRow label="Name" value="Hankook All-Season 225/45R17" />
              <InfoRow label="SKU" value="TIR-001234" />
              <InfoRow label="Mnemonic" value="KSGTIANKLO" mono />
              <InfoRow label="Category" value="TIRES" />
              <InfoRow label="Unit Price" value="PHP 4,850.00" />
              <InfoRow label="Cost Price" value="PHP 3,152.50" />
              <InfoRow label="Family" value="Hankook All-Season" />
            </div>
          </section>

          {/* Stock per location */}
          <section className="mb-6">
            <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Stock by Location
            </h4>
            <div className="space-y-2">
              <LocationStock name="Central Warehouse" stock={150} type="WAREHOUSE" />
              <LocationStock name="Downtown Store" stock={24} type="RETAIL" />
              <LocationStock name="Uptown Store" stock={12} type="RETAIL" />
            </div>
          </section>

          {/* Stock Journal */}
          <section className="mb-6">
            <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Stock Journal
            </h4>
            <div className="space-y-2">
              <JournalEntry type="RECEIVING" qty={+50} date="Mar 6, 2026" user="Admin" />
              <JournalEntry type="SALE" qty={-2} date="Mar 5, 2026" user="Cashier 1" />
              <JournalEntry type="TRANSFER_OUT" qty={-10} date="Mar 4, 2026" user="Admin" />
              <JournalEntry type="ADJUSTMENT" qty={+3} date="Mar 3, 2026" user="System" />
            </div>
          </section>

          {/* Vehicle Compatibility */}
          <section>
            <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Vehicle Compatibility
            </h4>
            <div className="space-y-1.5 text-sm">
              <CompatRow make="Toyota" model="Camry" years="2018-2024" />
              <CompatRow make="Honda" model="Accord" years="2019-2024" />
              <CompatRow make="Nissan" model="Altima" years="2020-2025" />
            </div>
          </section>
        </div>

        {/* Footer actions */}
        <div className="flex gap-2 border-t border-border p-4">
          <button className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Transfer Stock
          </button>
          <button className="flex-1 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent">
            Adjust Stock
          </button>
        </div>
      </div>
    </div>
  );
}

function StockBadge({ stock, status }: { stock: number; status: "in-stock" | "low" | "out" }) {
  const styles = {
    "in-stock": "bg-success/10 text-success",
    low: "bg-warning/10 text-warning",
    out: "bg-destructive/10 text-destructive",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {stock} units
    </span>
  );
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-xs" : "font-medium"}>{value}</span>
    </div>
  );
}

function LocationStock({ name, stock, type }: { name: string; stock: number; type: "WAREHOUSE" | "RETAIL" }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border p-3">
      <div>
        <div className="text-sm font-medium">{name}</div>
        <div className="text-xs text-muted-foreground">{type}</div>
      </div>
      <span className="text-sm font-semibold">{stock}</span>
    </div>
  );
}

function JournalEntry({ type, qty, date, user }: { type: string; qty: number; date: string; user: string }) {
  const isPositive = qty > 0;
  return (
    <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-xs">
      <div>
        <span className="font-medium">{type}</span>
        <span className="ml-2 text-muted-foreground">by {user}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className={isPositive ? "font-medium text-success" : "font-medium text-destructive"}>
          {isPositive ? "+" : ""}{qty}
        </span>
        <span className="text-muted-foreground">{date}</span>
      </div>
    </div>
  );
}

function CompatRow({ make, model, years }: { make: string; model: string; years: string }) {
  return (
    <div className="flex justify-between rounded-md bg-muted/50 px-3 py-2">
      <span>
        {make} {model}
      </span>
      <span className="text-muted-foreground">{years}</span>
    </div>
  );
}
