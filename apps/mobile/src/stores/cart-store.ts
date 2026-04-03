import { create } from 'zustand';
import { storage, getJSON, setJSON } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';
import { v4 as uuid } from 'uuid';
import {
  addHeldCart,
  removeHeldCart,
  getHeldCarts,
  getNextHeldLabel,
  type HeldCart,
} from '@/storage/held-carts';

/**
 * Cart storage key scoped by active location.
 * Prevents cart data from one store leaking into another when
 * the cashier switches location. Products, prices, and inventory
 * are all location-scoped — the cart must be too.
 *
 * Within a single location, a shared cart is acceptable in POS context
 * (e.g., manager completing an abandoned cart from a previous shift).
 */
function cartKey(): string {
  const locationId = storage.getString(KEYS.AUTH_LOCATION_ID);
  if (locationId) return `${KEYS.CART_STATE_PREFIX}.${locationId}`;
  return KEYS.CART_STATE_PREFIX;
}

export interface CartLine {
  id: string;
  productId: string;    // server UUID
  name: string;
  sku: string;
  mnemonicSku: string;
  barcode: string | null;
  unitPrice: number;
  quantity: number;
  discountType: 'none' | 'percentage' | 'fixed';
  discountValue: number;
  lineTotal: number;
  availableStock: number | null; // local stock snapshot at time of add
  // Serial tracking (batteries, alternators)
  isSerialized: boolean;
  serials: string[];
  warrantyMonths: number | null;
  warrantyPhotoUri: string | null;
  // DOT batch tracking (tires)
  isTire: boolean;
  dotAllocation: { dotBatchId: string; dotCode: string; quantity: number }[] | null;
  // Price override
  overridePrice: number | null;     // null = no override, use unitPrice
  overrideApprovedBy: string | null; // manager name who approved
}

export interface PaymentEntry {
  id: string;
  method: string;
  amount: number;
  reference: string;
  installmentTerm: string; // 'STRAIGHT' | '3_MONTHS' | '6_MONTHS' | '12_MONTHS'
}

interface CartStateData {
  lines: CartLine[];
  customerId: string | null;
  customerName: string | null;
  vehicleId: string | null;
  discountType: 'none' | 'percentage' | 'fixed';
  discountValue: number;
  payments: PaymentEntry[];
  receiptNumber: string;
  note: string;
  allowNegativeStock: boolean;
}

interface CartActions {
  addLine: (product: {
    serverId: string;
    name: string;
    sku: string;
    mnemonicSku: string;
    barcode: string | null;
    unitPrice: number;
    availableStock?: number | null;
    isSerialized?: boolean;
    isTire?: boolean;
    warrantyMonths?: number | null;
  }, qty?: number) => void;
  updateQuantity: (lineId: string, qty: number) => void;
  removeLine: (lineId: string) => void;
  setLineDiscount: (lineId: string, type: 'none' | 'percentage' | 'fixed', value: number) => void;
  setCartDiscount: (type: 'none' | 'percentage' | 'fixed', value: number) => void;
  attachCustomer: (customerId: string, customerName: string, vehicleId?: string) => void;
  detachCustomer: () => void;
  addPayment: (entry: Omit<PaymentEntry, 'id'>) => void;
  updatePayment: (id: string, updates: Partial<PaymentEntry>) => void;
  removePayment: (id: string) => void;
  clearPayments: () => void;
  setReceiptNumber: (num: string) => void;
  setNote: (note: string) => void;
  setAllowNegativeStock: (allow: boolean) => void;
  setLineSerials: (lineId: string, serials: string[]) => void;
  setLineDotAllocation: (lineId: string, allocation: { dotBatchId: string; dotCode: string; quantity: number }[]) => void;
  setLineWarrantyPhoto: (lineId: string, uri: string | null) => void;
  setLinePriceOverride: (lineId: string, newPrice: number, approvedBy: string) => void;
  clearLinePriceOverride: (lineId: string) => void;
  holdCurrentCart: () => boolean;            // save current cart, clear, return success
  restoreHeldCart: (heldCartId: string) => void;  // load held cart as active
  deleteHeldCart: (heldCartId: string) => void;
  clear: () => void;
}

type CartState = CartStateData & CartActions;

/**
 * Generate next sequential receipt number from MMKV.
 * Format: simple incrementing integer. Cashier can override in PaymentScreen.
 */
function getNextReceiptNumber(): string {
  const last = storage.getString(KEYS.LAST_RECEIPT_NUMBER) ?? '0';
  const next = parseInt(last, 10) + 1;
  return String(next);
}

function computeLineTotal(line: Pick<CartLine, 'unitPrice' | 'quantity' | 'discountType' | 'discountValue'> & { overridePrice?: number | null }): number {
  const price = line.overridePrice ?? line.unitPrice;
  const gross = price * line.quantity;
  if (line.discountType === 'percentage') return gross * (1 - line.discountValue / 100);
  if (line.discountType === 'fixed') return gross - line.discountValue;
  return gross;
}

/**
 * Persist cart state to MMKV synchronously.
 * This ensures the cart survives app restart, crash, or process kill.
 */
function persist(state: CartStateData): void {
  setJSON(storage, cartKey(), {
    lines: state.lines,
    customerId: state.customerId,
    customerName: state.customerName,
    vehicleId: state.vehicleId,
    discountType: state.discountType,
    discountValue: state.discountValue,
    payments: state.payments,
    receiptNumber: state.receiptNumber,
    note: state.note,
  });
}

/**
 * Load persisted cart from MMKV on app startup.
 * Returns empty cart if no persisted state found.
 * Handles migration from old single-payment format.
 */
function loadPersistedCart(): CartStateData {
  const saved = getJSON<any>(storage, cartKey());
  if (saved && saved.lines && saved.lines.length > 0) {
    // Migrate from old format (paymentMethod/cashTendered/referenceNumber)
    if (!Array.isArray(saved.payments)) {
      saved.payments = [];
    }
    return {
      lines: saved.lines,
      customerId: saved.customerId ?? null,
      customerName: saved.customerName ?? null,
      vehicleId: saved.vehicleId ?? null,
      discountType: saved.discountType ?? 'none',
      discountValue: saved.discountValue ?? 0,
      payments: saved.payments,
      receiptNumber: saved.receiptNumber ?? '',
      note: saved.note ?? '',
      allowNegativeStock: false,
    };
  }
  return {
    lines: [],
    customerId: null,
    customerName: null,
    vehicleId: null,
    discountType: 'none',
    discountValue: 0,
    payments: [],
    receiptNumber: '',
    note: '',
    allowNegativeStock: false,
  };
}

export const useCartStore = create<CartState>((set, get) => ({
  // Initialize from persisted state — cart survives app restart
  ...loadPersistedCart(),

  addLine: (product, qty = 1) => {
    set(state => {
      // Serialized products: don't auto-merge — each unit needs unique serials
      const canMerge = !(product.isSerialized || product.isTire);
      const existing = canMerge ? state.lines.find(l => l.productId === product.serverId) : null;
      let newLines: CartLine[];

      if (existing) {
        newLines = state.lines.map(l =>
          l.productId === product.serverId
            ? {
                ...l,
                quantity: l.quantity + qty,
                lineTotal: computeLineTotal({ ...l, quantity: l.quantity + qty }),
              }
            : l,
        );
      } else {
        const newLine: CartLine = {
          id: uuid(),
          productId: product.serverId,
          name: product.name,
          sku: product.sku,
          mnemonicSku: product.mnemonicSku,
          barcode: product.barcode,
          unitPrice: product.unitPrice,
          quantity: qty,
          discountType: 'none',
          discountValue: 0,
          lineTotal: product.unitPrice * qty,
          availableStock: product.availableStock ?? null,
          isSerialized: product.isSerialized ?? false,
          serials: [],
          warrantyMonths: product.warrantyMonths ?? null,
          warrantyPhotoUri: null,
          isTire: product.isTire ?? false,
          dotAllocation: null,
          overridePrice: null,
          overrideApprovedBy: null,
        };
        newLines = [...state.lines, newLine];
      }

      const newState = { ...state, lines: newLines };
      persist(newState);
      return { lines: newLines };
    });
  },

  updateQuantity: (lineId, qty) => {
    set(state => {
      if (qty <= 0) {
        const newLines = state.lines.filter(l => l.id !== lineId);
        const newState = { ...state, lines: newLines };
        persist(newState);
        return { lines: newLines };
      }
      const newLines = state.lines.map(l =>
        l.id === lineId
          ? { ...l, quantity: qty, lineTotal: computeLineTotal({ ...l, quantity: qty }) }
          : l,
      );
      const newState = { ...state, lines: newLines };
      persist(newState);
      return { lines: newLines };
    });
  },

  removeLine: (lineId) => {
    set(state => {
      const newLines = state.lines.filter(l => l.id !== lineId);
      const newState = { ...state, lines: newLines };
      persist(newState);
      return { lines: newLines };
    });
  },

  setLineDiscount: (lineId, type, value) => {
    set(state => {
      const newLines = state.lines.map(l =>
        l.id === lineId
          ? {
              ...l,
              discountType: type,
              discountValue: value,
              lineTotal: computeLineTotal({ ...l, discountType: type, discountValue: value }),
            }
          : l,
      );
      const newState = { ...state, lines: newLines };
      persist(newState);
      return { lines: newLines };
    });
  },

  setCartDiscount: (type, value) => {
    set(state => {
      const newState = { ...state, discountType: type, discountValue: value };
      persist(newState);
      return { discountType: type, discountValue: value };
    });
  },

  attachCustomer: (customerId, customerName, vehicleId) => {
    set(state => {
      const newState = { ...state, customerId, customerName, vehicleId: vehicleId ?? null };
      persist(newState);
      return { customerId, customerName, vehicleId: vehicleId ?? null };
    });
  },

  detachCustomer: () => {
    set(state => {
      const newState = { ...state, customerId: null, customerName: null, vehicleId: null };
      persist(newState);
      return { customerId: null, customerName: null, vehicleId: null };
    });
  },

  addPayment: (entry) => {
    set(state => {
      const newPayment: PaymentEntry = { ...entry, id: uuid() };
      const payments = [...state.payments, newPayment];
      const newState = { ...state, payments };
      persist(newState);
      return { payments };
    });
  },

  updatePayment: (id, updates) => {
    set(state => {
      const payments = state.payments.map(p =>
        p.id === id ? { ...p, ...updates } : p,
      );
      const newState = { ...state, payments };
      persist(newState);
      return { payments };
    });
  },

  removePayment: (id) => {
    set(state => {
      const payments = state.payments.filter(p => p.id !== id);
      const newState = { ...state, payments };
      persist(newState);
      return { payments };
    });
  },

  clearPayments: () => {
    set(state => {
      const newState = { ...state, payments: [] };
      persist(newState);
      return { payments: [] };
    });
  },

  setReceiptNumber: (num) => {
    set(state => {
      const newState = { ...state, receiptNumber: num };
      persist(newState);
      return { receiptNumber: num };
    });
  },

  setNote: (note) => {
    set(state => {
      const newState = { ...state, note };
      persist(newState);
      return { note };
    });
  },

  setAllowNegativeStock: (allow) => {
    set({ allowNegativeStock: allow });
  },

  setLineSerials: (lineId, serials) => {
    set(state => {
      const newLines = state.lines.map(l =>
        l.id === lineId ? { ...l, serials } : l,
      );
      const newState = { ...state, lines: newLines };
      persist(newState);
      return newState;
    });
  },

  setLineDotAllocation: (lineId, allocation) => {
    set(state => {
      const newLines = state.lines.map(l =>
        l.id === lineId ? { ...l, dotAllocation: allocation } : l,
      );
      const newState = { ...state, lines: newLines };
      persist(newState);
      return newState;
    });
  },

  setLineWarrantyPhoto: (lineId, uri) => {
    set(state => {
      const newLines = state.lines.map(l =>
        l.id === lineId ? { ...l, warrantyPhotoUri: uri } : l,
      );
      const newState = { ...state, lines: newLines };
      persist(newState);
      return newState;
    });
  },

  setLinePriceOverride: (lineId, newPrice, approvedBy) => {
    set(state => {
      const newLines = state.lines.map(l => {
        if (l.id !== lineId) return l;
        const overridden = { ...l, overridePrice: newPrice, overrideApprovedBy: approvedBy };
        overridden.lineTotal = computeLineTotal({ ...overridden, unitPrice: newPrice });
        return overridden;
      });
      const newState = { ...state, lines: newLines };
      persist(newState);
      return newState;
    });
  },

  clearLinePriceOverride: (lineId) => {
    set(state => {
      const newLines = state.lines.map(l => {
        if (l.id !== lineId) return l;
        const restored = { ...l, overridePrice: null, overrideApprovedBy: null };
        restored.lineTotal = computeLineTotal(restored);
        return restored;
      });
      const newState = { ...state, lines: newLines };
      persist(newState);
      return newState;
    });
  },

  holdCurrentCart: () => {
    const state = get();
    if (state.lines.length === 0) return false;

    const label = state.customerName || getNextHeldLabel();
    const totalAmount = state.lines.reduce((sum, l) => sum + l.lineTotal, 0);

    const heldCart: HeldCart = {
      id: uuid(),
      label,
      lines: state.lines,
      customerId: state.customerId,
      customerName: state.customerName,
      vehicleId: state.vehicleId,
      discountType: state.discountType,
      discountValue: state.discountValue,
      heldAt: new Date().toISOString(),
      totalAmount,
    };

    const success = addHeldCart(heldCart);
    if (success) {
      // Clear the active cart
      get().clear();
    }
    return success;
  },

  restoreHeldCart: (heldCartId) => {
    const heldCarts = getHeldCarts();
    const cart = heldCarts.find(c => c.id === heldCartId);
    if (!cart) return;

    // If current cart has items, hold it first
    const currentState = get();
    if (currentState.lines.length > 0) {
      currentState.holdCurrentCart();
    }

    // Restore the held cart
    const restored: CartStateData = {
      lines: cart.lines as CartLine[],
      customerId: cart.customerId,
      customerName: cart.customerName,
      vehicleId: cart.vehicleId,
      discountType: cart.discountType as any,
      discountValue: cart.discountValue,
      payments: [],
      receiptNumber: getNextReceiptNumber(),
      note: '',
      allowNegativeStock: false,
    };

    removeHeldCart(heldCartId);
    persist(restored);
    set(restored);
  },

  deleteHeldCart: (heldCartId) => {
    removeHeldCart(heldCartId);
  },

  clear: () => {
    const nextReceipt = getNextReceiptNumber();
    const empty: CartStateData = {
      lines: [],
      customerId: null,
      customerName: null,
      vehicleId: null,
      discountType: 'none',
      discountValue: 0,
      payments: [],
      receiptNumber: nextReceipt,
      note: '',
      allowNegativeStock: false,
    };
    persist(empty);
    set(empty);
  },
}));

// ── Derived selectors ──

export const selectSubtotal = (state: CartState): number =>
  state.lines.reduce((sum, l) => sum + l.lineTotal, 0);

export const selectCartDiscount = (state: CartState): number => {
  const subtotal = selectSubtotal(state);
  if (state.discountType === 'percentage') return subtotal * (state.discountValue / 100);
  if (state.discountType === 'fixed') return state.discountValue;
  return 0;
};

export const selectGrandTotal = (state: CartState): number =>
  selectSubtotal(state) - selectCartDiscount(state);

export const selectPaidTotal = (state: CartState): number =>
  state.payments.reduce((sum, p) => sum + p.amount, 0);

/** Lines with isSerialized=true that don't have enough serials entered */
export const selectIncompleteSerials = (state: CartState): CartLine[] =>
  state.lines.filter(l => l.isSerialized && l.serials.length < l.quantity);

export const selectRemainingBalance = (state: CartState): number =>
  selectGrandTotal(state) - selectPaidTotal(state);

export const selectLineCount = (state: CartState): number =>
  state.lines.reduce((sum, l) => sum + l.quantity, 0);
