"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import {
  useCreateSaleMutation,
  useCompleteSaleMutation,
  type SaleMutationStatus,
} from "@/hooks/use-sale-mutations";
import { useAuth } from "@/app/auth-context";

// ── Types ──

interface ProductResult {
  id: string;
  name: string;
  sku: string;
  mnemonicSku: string;
  category: string;
  unitPrice: string;
  stockLevel: number;
}

interface CartItem {
  productId: string;
  name: string;
  mnemonicSku: string;
  sku: string;
  category: string;
  unitPrice: string;
  quantity: number;
  overridePrice?: string;
  discountAmount?: string;
  notes?: string;
}

interface CustomerResult {
  id: string;
  name: string;
  phone: string;
  notes: string | null;
}

interface VehicleResult {
  id: string;
  make: string;
  model: string;
  year: number | null;
  plateNo: string | null;
}

/* ═══════════════════════════════════════════════
 * POS Page Root — Split-Panel Layout
 * ═══════════════════════════════════════════════ */
export default function POSPage() {
  const { token, locationId, loading, isAuthenticated } = useAuth();

  // ── Cart State (client-side) ──
  const [cart, setCart] = useState<CartItem[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerResult | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleResult | null>(null);
  const [saleNotes, setSaleNotes] = useState("");

  // ── Checkout flow state ──
  const [checkoutPhase, setCheckoutPhase] = useState<
    "idle" | "payment" | "creating" | "completing" | "success" | "error"
  >("idle");
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [completedSaleNo, setCompletedSaleNo] = useState<string | null>(null);

  // ── Payment method state ──
  type PaymentMethod = "CASH" | "CARD" | "EFT" | "ACCOUNT" | "OTHER";
  interface PaymentLine { method: PaymentMethod; amount: string; reference?: string }
  const [paymentMode, setPaymentMode] = useState<"single" | "split">("single");
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>("CASH");
  const [splitPayments, setSplitPayments] = useState<PaymentLine[]>([
    { method: "CASH", amount: "" },
    { method: "CARD", amount: "" },
  ]);
  const [cashTendered, setCashTendered] = useState("");

  const createSale = useCreateSaleMutation(token, locationId);
  const completeSale = useCompleteSaleMutation(token, locationId);

  // ── Product search query ──
  const { data: searchResults } = useQuery<{ data: ProductResult[] }>({
    queryKey: ["products", "search", productSearch],
    queryFn: () =>
      apiFetch<{ data: ProductResult[] }>(
        `/products/search?q=${encodeURIComponent(productSearch)}`,
        { token: token, locationId: locationId },
      ),
    enabled: productSearch.trim().length >= 2 && !!token,
    staleTime: 10_000,
  });

  // ── Customer search query ──
  const { data: customerResults } = useQuery<{ data: CustomerResult[] }>({
    queryKey: ["customers", "search", customerSearch],
    queryFn: () =>
      apiFetch<{ data: CustomerResult[] }>(
        `/customers/search?q=${encodeURIComponent(customerSearch)}`,
        { token: token, locationId: locationId },
      ),
    enabled: customerSearch.trim().length >= 2 && !!token,
    staleTime: 15_000,
  });

  // ── Vehicle list for selected customer ──
  const { data: vehicleResults } = useQuery<{ data: VehicleResult[] }>({
    queryKey: ["customer-vehicles", selectedCustomer?.id],
    queryFn: () =>
      apiFetch<{ data: VehicleResult[] }>(
        `/customers/${selectedCustomer!.id}/vehicles`,
        { token: token, locationId: locationId },
      ),
    enabled: !!selectedCustomer && !!token,
    staleTime: 30_000,
  });

  // ── Cart Helpers ──

  const addToCart = useCallback(
    (product: ProductResult) => {
      setCart((prev) => {
        const existing = prev.find((item) => item.productId === product.id);
        if (existing) {
          return prev.map((item) =>
            item.productId === product.id
              ? { ...item, quantity: item.quantity + 1 }
              : item,
          );
        }
        return [
          ...prev,
          {
            productId: product.id,
            name: product.name,
            mnemonicSku: product.mnemonicSku,
            sku: product.sku,
            category: product.category,
            unitPrice: product.unitPrice,
            quantity: 1,
          },
        ];
      });
    },
    [],
  );

  const updateQuantity = useCallback((productId: string, qty: number) => {
    if (qty < 1) {
      setCart((prev) => prev.filter((item) => item.productId !== productId));
    } else {
      setCart((prev) =>
        prev.map((item) =>
          item.productId === productId ? { ...item, quantity: qty } : item,
        ),
      );
    }
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    setSelectedCustomer(null);
    setSelectedVehicle(null);
    setSaleNotes("");
    setCheckoutPhase("idle");
    setCheckoutError(null);
    setCompletedSaleNo(null);
    setPaymentMode("single");
    setSelectedMethod("CASH");
    setSplitPayments([{ method: "CASH", amount: "" }, { method: "CARD", amount: "" }]);
    setCashTendered("");
  }, []);

  // ── Computed Totals ──
  const { subtotal, discountTotal, grandTotal } = useMemo(() => {
    let sub = 0;
    let disc = 0;
    for (const item of cart) {
      const price = item.overridePrice
        ? parseFloat(item.overridePrice)
        : parseFloat(item.unitPrice);
      const discount = item.discountAmount
        ? parseFloat(item.discountAmount)
        : 0;
      sub += price * item.quantity;
      disc += discount;
    }
    return {
      subtotal: sub,
      discountTotal: disc,
      grandTotal: sub - disc,
    };
  }, [cart]);

  // ── Checkout: Step 1 — Open payment method picker ──
  const handleCheckout = useCallback(() => {
    if (cart.length === 0 || checkoutPhase !== "idle") return;
    setCashTendered("");
    setCheckoutPhase("payment");
  }, [cart, checkoutPhase]);

  // ── Checkout: Step 2 — Create + Complete with payment info ──
  const handleConfirmPayment = useCallback(async () => {
    if (checkoutPhase !== "payment") return;

    // Build payments array
    let payments: { method: string; amount: string; reference?: string }[];
    if (paymentMode === "single") {
      payments = [{ method: selectedMethod, amount: grandTotal.toFixed(2) }];
    } else {
      payments = splitPayments
        .filter((p) => p.amount && parseFloat(p.amount) > 0)
        .map((p) => ({ method: p.method, amount: parseFloat(p.amount).toFixed(2), reference: p.reference }));
    }

    setCheckoutPhase("creating");
    setCheckoutError(null);

    try {
      const saleResult = await createSale.mutateAsync({
        locationId: locationId,
        customerId: selectedCustomer?.id,
        customerVehicleId: selectedVehicle?.id,
        notes: saleNotes || undefined,
        lines: cart.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          overridePrice: item.overridePrice,
          discountAmount: item.discountAmount,
          notes: item.notes,
        })),
      });

      setCheckoutPhase("completing");

      const idempotencyKey = crypto.randomUUID();
      await apiFetch(`/sales/${saleResult.sale.id}/complete`, {
        method: "POST",
        body: JSON.stringify({ idempotencyKey, payments }),
        token: token,
        locationId: locationId,
      });

      setCheckoutPhase("success");
      setCompletedSaleNo(saleResult.sale.saleNo);
    } catch (err: any) {
      setCheckoutPhase("error");
      setCheckoutError(err.message ?? "Checkout failed");
    }
  }, [checkoutPhase, paymentMode, selectedMethod, grandTotal, splitPayments, createSale, selectedCustomer, selectedVehicle, saleNotes, cart]);

  // ── Keyboard shortcut: Escape clears search ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setProductSearch("");
        setCustomerSearch("");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] lg:h-[calc(100vh-7rem)] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-7rem)] gap-4">
      {/* ── LEFT PANEL: Product Search ── */}
      <div className="flex flex-1 lg:w-[55%] lg:flex-none flex-col overflow-y-auto">
        <div className="mb-3">
          <h2 className="text-lg font-semibold">Point of Sale</h2>
          <p className="text-xs text-muted-foreground">
            Search products by mnemonic, SKU, or name
          </p>
        </div>

        {/* Product search bar */}
        <div className="mb-3">
          <input
            type="text"
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            placeholder="Type mnemonic, SKU, or product name..."
            className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/20"
            autoFocus
          />
        </div>

        {/* Search Results */}
        <div className="flex-1 overflow-y-auto rounded-lg border border-border">
          {productSearch.trim().length < 2 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <svg
                className="mb-3 h-10 w-10 text-muted-foreground/30"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <p className="text-sm text-muted-foreground">
                Start typing to search products
              </p>
              <p className="mt-1 text-xs text-muted-foreground/60">
                Mnemonic codes are fastest for experienced staff
              </p>
            </div>
          ) : !searchResults?.data?.length ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <p className="text-sm text-muted-foreground">No products found</p>
              <p className="mt-1 text-xs text-muted-foreground/60">
                Try a different search term
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {searchResults.data.map((product) => {
                const inCart = cart.find(
                  (item) => item.productId === product.id,
                );
                return (
                  <button
                    key={product.id}
                    onClick={() => addToCart(product)}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-accent"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-xs font-bold tracking-wider text-primary">
                          {product.mnemonicSku}
                        </span>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                          {product.category}
                        </span>
                        {inCart && (
                          <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
                            {inCart.quantity} in cart
                          </span>
                        )}
                      </div>
                      <div className="mt-1 truncate text-sm font-medium">
                        {product.name}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        SKU: {product.sku}
                      </div>
                    </div>
                    <div className="pl-4 text-right">
                      <div className="text-sm font-semibold tabular-nums">
                        PHP {parseFloat(product.unitPrice).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                      </div>
                      <StockBadge stock={product.stockLevel} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT PANEL: Cart + Checkout ── */}
      <div className="flex lg:w-[45%] lg:flex-none flex-col rounded-lg border-t lg:border-t-0 lg:border-l border-border bg-muted/20 overflow-y-auto">
        {/* Cart Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold">Cart</h3>
            <span className="text-xs text-muted-foreground">
              {cart.length} item{cart.length !== 1 ? "s" : ""}
            </span>
          </div>
          {cart.length > 0 && checkoutPhase === "idle" && (
            <button
              onClick={clearCart}
              className="rounded-md px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
            >
              Clear All
            </button>
          )}
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <svg
                className="mb-2 h-8 w-8 text-muted-foreground/30"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z"
                />
              </svg>
              <p className="text-sm text-muted-foreground">Cart is empty</p>
              <p className="mt-1 text-xs text-muted-foreground/60">
                Search and click products to add
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/50 px-4">
              {cart.map((item) => (
                <div key={item.productId} className="py-3">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider text-primary">
                        {item.mnemonicSku}
                      </span>
                      <div className="mt-1 text-sm font-medium leading-tight">
                        {item.name}
                      </div>
                    </div>
                    <button
                      onClick={() => removeFromCart(item.productId)}
                      className="ml-2 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <svg
                        className="h-3.5 w-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() =>
                          updateQuantity(item.productId, item.quantity - 1)
                        }
                        className="flex h-6 w-6 items-center justify-center rounded border border-border text-xs hover:bg-accent"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) =>
                          updateQuantity(
                            item.productId,
                            parseInt(e.target.value) || 1,
                          )
                        }
                        className="h-6 w-12 rounded border border-border bg-background text-center text-xs tabular-nums outline-none focus:border-primary"
                      />
                      <button
                        onClick={() =>
                          updateQuantity(item.productId, item.quantity + 1)
                        }
                        className="flex h-6 w-6 items-center justify-center rounded border border-border text-xs hover:bg-accent"
                      >
                        +
                      </button>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">
                        {parseFloat(item.unitPrice).toLocaleString("en-PH", { minimumFractionDigits: 2 })} each
                      </div>
                      <div className="text-sm font-semibold tabular-nums">
                        PHP{" "}
                        {(
                          parseFloat(item.unitPrice) * item.quantity
                        ).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Optional Customer Attachment */}
        {cart.length > 0 && checkoutPhase === "idle" && (
          <CustomerAttachment
            customerSearch={customerSearch}
            setCustomerSearch={setCustomerSearch}
            customerResults={customerResults?.data ?? []}
            selectedCustomer={selectedCustomer}
            setSelectedCustomer={setSelectedCustomer}
            vehicleResults={vehicleResults?.data ?? []}
            selectedVehicle={selectedVehicle}
            setSelectedVehicle={setSelectedVehicle}
          />
        )}

        {/* Totals + Checkout */}
        {cart.length > 0 && (
          <div className="border-t border-border bg-background px-4 py-3">
            {/* Totals */}
            <div className="mb-3 space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Subtotal</span>
                <span className="tabular-nums">
                  PHP {subtotal.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                </span>
              </div>
              {discountTotal > 0 && (
                <div className="flex justify-between text-xs text-destructive">
                  <span>Discount</span>
                  <span className="tabular-nums">
                    -PHP {discountTotal.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              <div className="flex justify-between border-t border-border pt-1 text-base font-bold">
                <span>Total</span>
                <span className="tabular-nums">
                  PHP {grandTotal.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Payment Method Picker */}
            {checkoutPhase === "payment" && (
              <PaymentMethodPicker
                grandTotal={grandTotal}
                paymentMode={paymentMode}
                setPaymentMode={setPaymentMode}
                selectedMethod={selectedMethod}
                setSelectedMethod={setSelectedMethod}
                splitPayments={splitPayments}
                setSplitPayments={setSplitPayments}
                cashTendered={cashTendered}
                setCashTendered={setCashTendered}
                onConfirm={handleConfirmPayment}
                onBack={() => setCheckoutPhase("idle")}
              />
            )}

            {/* Checkout feedback */}
            {checkoutPhase !== "idle" && checkoutPhase !== "payment" && (
              <CheckoutStatusBanner
                phase={checkoutPhase}
                saleNo={completedSaleNo}
                error={checkoutError}
                paymentMethod={paymentMode === "single" ? selectedMethod : "SPLIT"}
                changeAmount={
                  paymentMode === "single" && selectedMethod === "CASH" && cashTendered
                    ? parseFloat(cashTendered) - grandTotal
                    : undefined
                }
              />
            )}

            {/* Action buttons */}
            {checkoutPhase !== "payment" && (
              <div className="flex gap-2">
                {checkoutPhase === "success" ? (
                  <button
                    onClick={clearCart}
                    className="flex-1 rounded-md bg-success px-3 py-2.5 text-sm font-semibold text-white hover:bg-success/90"
                  >
                    New Sale
                  </button>
                ) : (
                  <>
                    <button
                      onClick={handleCheckout}
                      disabled={
                        checkoutPhase !== "idle" || cart.length === 0
                      }
                      className="flex-1 rounded-md bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {checkoutPhase === "creating" ? (
                        <span className="flex items-center justify-center gap-2">
                          <Spinner /> Creating sale...
                        </span>
                      ) : checkoutPhase === "completing" ? (
                        <span className="flex items-center justify-center gap-2">
                          <Spinner /> Processing checkout...
                        </span>
                      ) : (
                        `Checkout — PHP ${grandTotal.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
                      )}
                    </button>
                    {checkoutPhase === "error" && (
                      <button
                        onClick={() => {
                          setCheckoutPhase("payment");
                          setCheckoutError(null);
                        }}
                        className="rounded-md border border-border px-3 py-2.5 text-sm font-medium hover:bg-accent"
                      >
                        Retry
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
 * Customer Attachment — Optional, non-blocking
 * ═══════════════════════════════════════════════ */
function CustomerAttachment({
  customerSearch,
  setCustomerSearch,
  customerResults,
  selectedCustomer,
  setSelectedCustomer,
  vehicleResults,
  selectedVehicle,
  setSelectedVehicle,
}: {
  customerSearch: string;
  setCustomerSearch: (v: string) => void;
  customerResults: CustomerResult[];
  selectedCustomer: CustomerResult | null;
  setSelectedCustomer: (c: CustomerResult | null) => void;
  vehicleResults: VehicleResult[];
  selectedVehicle: VehicleResult | null;
  setSelectedVehicle: (v: VehicleResult | null) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-t border-border px-4 py-2">
      {selectedCustomer ? (
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-medium">
              {selectedCustomer.name}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {selectedCustomer.phone}
              {selectedVehicle && (
                <span>
                  {" "}
                  · {selectedVehicle.make} {selectedVehicle.model}
                  {selectedVehicle.year ? ` ${selectedVehicle.year}` : ""}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => {
              setSelectedCustomer(null);
              setSelectedVehicle(null);
              setCustomerSearch("");
            }}
            className="rounded px-2 py-1 text-[10px] text-destructive hover:bg-destructive/10"
          >
            Remove
          </button>
        </div>
      ) : (
        <div>
          {!isOpen ? (
            <button
              onClick={() => setIsOpen(true)}
              className="w-full rounded-md border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:border-primary hover:text-primary"
            >
              + Attach Customer / Vehicle (optional)
            </button>
          ) : (
            <div className="space-y-2">
              <input
                type="text"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="Search by name or phone..."
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs outline-none placeholder:text-muted-foreground focus:border-primary"
                autoFocus
              />
              {customerResults.length > 0 && (
                <div className="max-h-28 overflow-y-auto rounded-md border border-border">
                  {customerResults.map((customer) => (
                    <button
                      key={customer.id}
                      onClick={() => {
                        setSelectedCustomer(customer);
                        setCustomerSearch("");
                        setIsOpen(false);
                      }}
                      className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-accent"
                    >
                      <span className="font-medium">{customer.name}</span>
                      <span className="text-muted-foreground">
                        {customer.phone}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() => {
                  setIsOpen(false);
                  setCustomerSearch("");
                }}
                className="text-[10px] text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/* Vehicle selector — only when customer is selected */}
      {selectedCustomer && !selectedVehicle && vehicleResults.length > 0 && (
        <div className="mt-2">
          <label className="mb-1 block text-[10px] font-medium text-muted-foreground">
            Vehicle (optional)
          </label>
          <div className="flex flex-wrap gap-1">
            {vehicleResults.map((v) => (
              <button
                key={v.id}
                onClick={() => setSelectedVehicle(v)}
                className="rounded-md border border-border px-2 py-1 text-[10px] hover:border-primary hover:text-primary"
              >
                {v.make} {v.model}
                {v.year ? ` ${v.year}` : ""}
                {v.plateNo ? ` (${v.plateNo})` : ""}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
 * Payment Method Picker
 * ═══════════════════════════════════════════════ */
const PAYMENT_METHODS = [
  { value: "CASH", label: "Cash", icon: "\u{1F4B5}" },
  { value: "CARD", label: "Card", icon: "\u{1F4B3}" },
  { value: "EFT", label: "EFT", icon: "\u{1F3E6}" },
  { value: "ACCOUNT", label: "Account", icon: "\u{1F4CB}" },
  { value: "OTHER", label: "Other", icon: "\u2022" },
] as const;

function PaymentMethodPicker({
  grandTotal,
  paymentMode,
  setPaymentMode,
  selectedMethod,
  setSelectedMethod,
  splitPayments,
  setSplitPayments,
  cashTendered,
  setCashTendered,
  onConfirm,
  onBack,
}: {
  grandTotal: number;
  paymentMode: "single" | "split";
  setPaymentMode: (m: "single" | "split") => void;
  selectedMethod: string;
  setSelectedMethod: (m: any) => void;
  splitPayments: { method: string; amount: string; reference?: string }[];
  setSplitPayments: (p: any) => void;
  cashTendered: string;
  setCashTendered: (v: string) => void;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const splitTotal = splitPayments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const splitValid = Math.abs(splitTotal - grandTotal) < 0.01 && splitPayments.some((p) => parseFloat(p.amount) > 0);
  const cashChange = cashTendered ? parseFloat(cashTendered) - grandTotal : 0;

  return (
    <div className="mb-3 rounded-lg border border-primary/20 bg-primary/[0.02] p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">Payment Method</span>
        <div className="flex gap-1">
          <button
            onClick={() => setPaymentMode("single")}
            className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${paymentMode === "single" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            Single
          </button>
          <button
            onClick={() => setPaymentMode("split")}
            className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${paymentMode === "split" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            Split
          </button>
        </div>
      </div>

      {paymentMode === "single" ? (
        <div>
          <div className="grid grid-cols-5 gap-1.5">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m.value}
                onClick={() => setSelectedMethod(m.value)}
                className={`flex flex-col items-center gap-0.5 rounded-lg border py-2 text-center transition-colors ${
                  selectedMethod === m.value
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
                }`}
              >
                <span className="text-sm">{m.icon}</span>
                <span className="text-[10px] font-medium">{m.label}</span>
              </button>
            ))}
          </div>
          {selectedMethod === "CASH" && (
            <div className="mt-2">
              <label className="mb-1 block text-[10px] font-medium text-muted-foreground">Cash tendered (optional)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={cashTendered}
                onChange={(e) => setCashTendered(e.target.value)}
                placeholder={grandTotal.toFixed(2)}
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm tabular-nums outline-none focus:border-primary"
              />
              {cashTendered && cashChange >= 0 && (
                <div className="mt-1 flex justify-between text-xs">
                  <span className="text-muted-foreground">Change</span>
                  <span className="font-semibold tabular-nums text-success">
                    PHP {cashChange.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              {cashTendered && cashChange < 0 && (
                <div className="mt-1 text-[10px] text-destructive">Insufficient amount</div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="space-y-1.5">
            {splitPayments.map((p, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <select
                  value={p.method}
                  onChange={(e) => {
                    const updated = [...splitPayments];
                    updated[i] = { ...updated[i], method: e.target.value };
                    setSplitPayments(updated);
                  }}
                  className="h-7 flex-1 rounded-md border border-border bg-background px-2 text-[11px] outline-none focus:border-primary"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={p.amount}
                  onChange={(e) => {
                    const updated = [...splitPayments];
                    updated[i] = { ...updated[i], amount: e.target.value };
                    setSplitPayments(updated);
                  }}
                  placeholder="0.00"
                  className="h-7 w-24 rounded-md border border-border bg-background px-2 text-right text-[11px] tabular-nums outline-none focus:border-primary"
                />
                {splitPayments.length > 2 && (
                  <button
                    onClick={() => setSplitPayments(splitPayments.filter((_, j) => j !== i))}
                    className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            <button
              onClick={() => setSplitPayments([...splitPayments, { method: "CASH", amount: "" }])}
              className="text-[10px] font-medium text-primary hover:text-primary/80"
            >
              + Add line
            </button>
            <div className="text-[10px] tabular-nums">
              <span className="text-muted-foreground">Allocated: </span>
              <span className={Math.abs(splitTotal - grandTotal) < 0.01 ? "font-semibold text-success" : "font-semibold text-destructive"}>
                PHP {splitTotal.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
              </span>
              <span className="text-muted-foreground"> / PHP {grandTotal.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>
      )}

      {/* Confirm / Back */}
      <div className="mt-3 flex gap-2">
        <button
          onClick={onBack}
          className="rounded-md border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Back
        </button>
        <button
          onClick={onConfirm}
          disabled={paymentMode === "split" && !splitValid}
          className="flex-1 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Confirm Payment — PHP {grandTotal.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
 * Checkout Status Banner
 * ═══════════════════════════════════════════════ */
function CheckoutStatusBanner({
  phase,
  saleNo,
  error,
  paymentMethod,
  changeAmount,
}: {
  phase: string;
  saleNo: string | null;
  error: string | null;
  paymentMethod?: string;
  changeAmount?: number;
}) {
  const config: Record<string, { style: string; icon: string; message: string }> = {
    creating: {
      style: "bg-primary/5 border-primary/20 text-primary",
      icon: "\u23f3",
      message: "Creating sale...",
    },
    completing: {
      style: "bg-primary/5 border-primary/20 text-primary",
      icon: "\u23f3",
      message: "Processing checkout — deducting inventory...",
    },
    success: {
      style: "bg-success/10 border-success/20 text-success",
      icon: "\u2713",
      message: `Sale ${saleNo} completed!`,
    },
    error: {
      style: "bg-destructive/10 border-destructive/20 text-destructive",
      icon: "\u2715",
      message: error ?? "Checkout failed",
    },
  };

  const c = config[phase];
  if (!c) return null;

  return (
    <div className={`mb-3 rounded-md border px-3 py-2 text-xs font-medium ${c.style}`}>
      <div className="flex items-start gap-2">
        <span className="shrink-0 text-sm">{c.icon}</span>
        <span>{c.message}</span>
      </div>
      {phase === "success" && paymentMethod && (
        <div className="mt-1 flex items-center gap-3 pl-6 text-[10px]">
          <span>Paid via {paymentMethod === "SPLIT" ? "Split Payment" : paymentMethod}</span>
          {changeAmount !== undefined && changeAmount > 0 && (
            <span className="font-semibold">Change: PHP {changeAmount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</span>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
 * Stock Badge
 * ═══════════════════════════════════════════════ */
function StockBadge({ stock }: { stock: number }) {
  const status = stock === 0 ? "out" : stock <= 5 ? "low" : "in-stock";
  const styles = {
    "in-stock": "bg-success/10 text-success",
    low: "bg-warning/10 text-warning",
    out: "bg-destructive/10 text-destructive",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums ${styles[status]}`}
    >
      {stock} in stock
    </span>
  );
}

/* ═══════════════════════════════════════════════
 * Spinner
 * ═══════════════════════════════════════════════ */
function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
