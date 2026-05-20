import { create } from 'zustand';
import { storage, getJSON, setJSON } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';
import { getLockedLocationId } from '@/config/device-binding';
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
  const locationId = getLockedLocationId() ?? storage.getString(KEYS.AUTH_LOCATION_ID);
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
  overrideAuthorizationMethod?: 'pin' | 'barcode' | 'card' | 'session' | null;
  overrideApprovedAt?: string | null;
  overrideNote?: string | null;
  // Technician assignment (labor items)
  technicianId: string | null;
}

export interface PaymentEntry {
  id: string;
  method: string;
  /** Applied amount posted to the sale. Cash over-tender is tracked separately. */
  amount: number;
  cashTendered?: number;
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
  setLinePriceOverride: (
    lineId: string,
    newPrice: number,
    approvedBy: string,
    audit?: {
      authorizationMethod?: 'pin' | 'barcode' | 'card' | 'session';
      note?: string;
    },
  ) => void;
  clearLinePriceOverride: (lineId: string) => void;
  setLineTechnician: (lineId: string, technicianId: string | null) => void;
  holdCurrentCart: () => boolean;            // save current cart, clear, return success
  restoreHeldCart: (heldCartId: string) => boolean;  // load held cart as active
  deleteHeldCart: (heldCartId: string) => void;
  reloadForCurrentLocation: () => void;
  clear: () => void;
  clearWithRestoreSnapshot: () => boolean;
  restoreLastClearedCart: () => boolean;
}

type CartState = CartStateData & CartActions;

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function clearPaymentsForCartEdit<T extends CartStateData>(state: T): T {
  return state.payments.length > 0 ? { ...state, payments: [] } : state;
}

function computeLineTotal(line: Pick<CartLine, 'unitPrice' | 'quantity' | 'discountType' | 'discountValue'> & { overridePrice?: number | null }): number {
  const price = line.overridePrice ?? line.unitPrice;
  const gross = price * line.quantity;
  if (line.discountType === 'percentage') {
    return roundMoney(Math.max(0, gross * (1 - line.discountValue / 100)));
  }
  if (line.discountType === 'fixed') {
    return roundMoney(Math.max(0, gross - line.discountValue));
  }
  return roundMoney(Math.max(0, gross));
}

function computeSubtotal(lines: Pick<CartLine, 'lineTotal'>[]): number {
  return roundMoney(lines.reduce((sum, line) => sum + line.lineTotal, 0));
}

function computeCartDiscount(
  subtotal: number,
  discountType: 'none' | 'percentage' | 'fixed',
  discountValue: number,
): number {
  const rawDiscount = discountType === 'percentage'
    ? subtotal * (discountValue / 100)
    : discountType === 'fixed'
      ? discountValue
      : 0;
  return roundMoney(Math.min(subtotal, Math.max(0, rawDiscount)));
}

function computeGrandTotal(state: Pick<CartStateData, 'lines' | 'discountType' | 'discountValue'>): number {
  const subtotal = computeSubtotal(state.lines);
  return roundMoney(Math.max(0, subtotal - computeCartDiscount(subtotal, state.discountType, state.discountValue)));
}

function emptyCart(): CartStateData {
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

function cartSnapshot(state: CartStateData): CartStateData {
  return {
    lines: state.lines,
    customerId: state.customerId,
    customerName: state.customerName,
    vehicleId: state.vehicleId,
    discountType: state.discountType,
    discountValue: state.discountValue,
    payments: state.payments,
    receiptNumber: state.receiptNumber,
    note: state.note,
    allowNegativeStock: state.allowNegativeStock,
  };
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
  return emptyCart();
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
          lineTotal: roundMoney(product.unitPrice * qty),
          availableStock: product.availableStock ?? null,
          isSerialized: product.isSerialized ?? false,
          serials: [],
          warrantyMonths: product.warrantyMonths ?? null,
          warrantyPhotoUri: null,
          isTire: product.isTire ?? false,
          dotAllocation: null,
          overridePrice: null,
          overrideApprovedBy: null,
          overrideAuthorizationMethod: null,
          overrideApprovedAt: null,
          overrideNote: null,
          technicianId: null,
        };
        newLines = [...state.lines, newLine];
      }

      const newState = clearPaymentsForCartEdit({ ...state, lines: newLines });
      persist(newState);
      return { lines: newLines, payments: newState.payments };
    });
  },

  updateQuantity: (lineId, qty) => {
    set(state => {
      if (qty <= 0) {
        const newLines = state.lines.filter(l => l.id !== lineId);
        const newState = clearPaymentsForCartEdit({ ...state, lines: newLines });
        persist(newState);
        return { lines: newLines, payments: newState.payments };
      }
      const newLines = state.lines.map(l =>
        l.id === lineId
          ? { ...l, quantity: qty, lineTotal: computeLineTotal({ ...l, quantity: qty }) }
          : l,
      );
      const newState = clearPaymentsForCartEdit({ ...state, lines: newLines });
      persist(newState);
      return { lines: newLines, payments: newState.payments };
    });
  },

  removeLine: (lineId) => {
    set(state => {
      const newLines = state.lines.filter(l => l.id !== lineId);
      const newState = clearPaymentsForCartEdit({ ...state, lines: newLines });
      persist(newState);
      return { lines: newLines, payments: newState.payments };
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
      const newState = clearPaymentsForCartEdit({ ...state, lines: newLines });
      persist(newState);
      return { lines: newLines, payments: newState.payments };
    });
  },

  setCartDiscount: (type, value) => {
    set(state => {
      const newState = clearPaymentsForCartEdit({ ...state, discountType: type, discountValue: value });
      persist(newState);
      return { discountType: type, discountValue: value, payments: newState.payments };
    });
  },

  attachCustomer: (customerId, customerName, vehicleId) => {
    set(state => {
      const newState = clearPaymentsForCartEdit({ ...state, customerId, customerName, vehicleId: vehicleId ?? null });
      persist(newState);
      return { customerId, customerName, vehicleId: vehicleId ?? null, payments: newState.payments };
    });
  },

  detachCustomer: () => {
    set(state => {
      const newState = clearPaymentsForCartEdit({ ...state, customerId: null, customerName: null, vehicleId: null });
      persist(newState);
      return { customerId: null, customerName: null, vehicleId: null, payments: newState.payments };
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
      const newState = clearPaymentsForCartEdit({ ...state, lines: newLines });
      persist(newState);
      return newState;
    });
  },

  setLineDotAllocation: (lineId, allocation) => {
    set(state => {
      const newLines = state.lines.map(l =>
        l.id === lineId ? { ...l, dotAllocation: allocation } : l,
      );
      const newState = clearPaymentsForCartEdit({ ...state, lines: newLines });
      persist(newState);
      return newState;
    });
  },

  setLineWarrantyPhoto: (lineId, uri) => {
    set(state => {
      const newLines = state.lines.map(l =>
        l.id === lineId ? { ...l, warrantyPhotoUri: uri } : l,
      );
      const newState = clearPaymentsForCartEdit({ ...state, lines: newLines });
      persist(newState);
      return newState;
    });
  },

  setLinePriceOverride: (lineId, newPrice, approvedBy, audit) => {
    set(state => {
      const newLines = state.lines.map(l => {
        if (l.id !== lineId) return l;
        const overridden = {
          ...l,
          overridePrice: newPrice,
          overrideApprovedBy: approvedBy,
          overrideAuthorizationMethod: audit?.authorizationMethod ?? 'session',
          overrideApprovedAt: new Date().toISOString(),
          overrideNote: audit?.note ?? null,
        };
        overridden.lineTotal = computeLineTotal({ ...overridden, unitPrice: newPrice });
        return overridden;
      });
      const newState = clearPaymentsForCartEdit({ ...state, lines: newLines });
      persist(newState);
      return newState;
    });
  },

  clearLinePriceOverride: (lineId) => {
    set(state => {
      const newLines = state.lines.map(l => {
        if (l.id !== lineId) return l;
        const restored = {
          ...l,
          overridePrice: null,
          overrideApprovedBy: null,
          overrideAuthorizationMethod: null,
          overrideApprovedAt: null,
          overrideNote: null,
        };
        restored.lineTotal = computeLineTotal(restored);
        return restored;
      });
      const newState = clearPaymentsForCartEdit({ ...state, lines: newLines });
      persist(newState);
      return newState;
    });
  },

  setLineTechnician: (lineId, technicianId) => {
    set(state => {
      const newLines = state.lines.map(l =>
        l.id === lineId ? { ...l, technicianId } : l
      );
      const newState = { ...state, lines: newLines };
      persist(newState);
      return newState;
    });
  },

  holdCurrentCart: () => {
    const state = get();
    if (state.lines.length === 0) return false;

    const label = state.customerName || getNextHeldLabel();
    const totalAmount = computeGrandTotal(state);

    const heldCart: HeldCart = {
      id: uuid(),
      label,
      lines: state.lines,
      customerId: state.customerId,
      customerName: state.customerName,
      vehicleId: state.vehicleId,
      discountType: state.discountType,
      discountValue: state.discountValue,
      note: state.note,
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
    if (!cart) return false;

    const currentState = get();
    const shouldSwapFullHeldQueue = currentState.lines.length > 0 && heldCarts.length >= 5;
    let removedTargetBeforeSwap = false;

    if (shouldSwapFullHeldQueue) {
      removeHeldCart(heldCartId);
      removedTargetBeforeSwap = true;
    }

    // If current cart has items, hold it first. When the queue is full,
    // freeing the target slot lets cashiers swap carts instead of getting stuck.
    if (currentState.lines.length > 0) {
      const heldActiveCart = currentState.holdCurrentCart();
      if (!heldActiveCart) {
        if (removedTargetBeforeSwap) addHeldCart(cart);
        return false;
      }
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
      receiptNumber: '',
      note: cart.note ?? '',
      allowNegativeStock: false,
    };

    if (!removedTargetBeforeSwap) removeHeldCart(heldCartId);
    persist(restored);
    set(restored);
    return true;
  },

  deleteHeldCart: (heldCartId) => {
    removeHeldCart(heldCartId);
  },

  reloadForCurrentLocation: () => {
    set(loadPersistedCart());
  },

  clear: () => {
    const empty = emptyCart();
    persist(empty);
    set(empty);
  },

  clearWithRestoreSnapshot: () => {
    const current = get();
    if (current.lines.length === 0) return false;
    setJSON(storage, KEYS.CART_RESTORE_SNAPSHOT, {
      savedAt: new Date().toISOString(),
      cart: cartSnapshot(current),
    });
    const empty = emptyCart();
    persist(empty);
    set(empty);
    return true;
  },

  restoreLastClearedCart: () => {
    const snapshot = getJSON<{ savedAt: string; cart: CartStateData }>(
      storage,
      KEYS.CART_RESTORE_SNAPSHOT,
    );
    if (!snapshot?.cart?.lines?.length) return false;
    const restored = cartSnapshot(snapshot.cart);
    persist(restored);
    set(restored);
    storage.delete(KEYS.CART_RESTORE_SNAPSHOT);
    return true;
  },
}));

// ── Derived selectors ──

export const selectSubtotal = (state: CartState): number =>
  computeSubtotal(state.lines);

export const selectCartDiscount = (state: CartState): number => {
  const subtotal = selectSubtotal(state);
  return computeCartDiscount(subtotal, state.discountType, state.discountValue);
};

export const selectGrandTotal = (state: CartState): number =>
  computeGrandTotal(state);

export const selectPaidTotal = (state: CartState): number =>
  roundMoney(state.payments.reduce((sum, p) => sum + p.amount, 0));

/** Lines with isSerialized=true that don't have enough serials entered */
export const selectIncompleteSerials = (state: CartState): CartLine[] =>
  state.lines.filter(l => l.isSerialized && l.serials.length < l.quantity);

export const selectRemainingBalance = (state: CartState): number =>
  roundMoney(Math.max(0, selectGrandTotal(state) - selectPaidTotal(state)));

export const selectLineCount = (state: CartState): number =>
  state.lines.reduce((sum, l) => sum + l.quantity, 0);
