import { create } from 'zustand';
import { storage, getJSON, setJSON } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';
import { v4 as uuid } from 'uuid';

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
}

interface CartStateData {
  lines: CartLine[];
  customerId: string | null;
  customerName: string | null;
  vehicleId: string | null;
  discountType: 'none' | 'percentage' | 'fixed';
  discountValue: number;
  paymentMethod: 'CASH' | 'CARD' | 'QRPH' | 'GCASH' | 'MAYA';
  cashTendered: number;
  note: string;
}

interface CartActions {
  addLine: (product: {
    serverId: string;
    name: string;
    sku: string;
    mnemonicSku: string;
    barcode: string | null;
    unitPrice: number;
  }, qty?: number) => void;
  updateQuantity: (lineId: string, qty: number) => void;
  removeLine: (lineId: string) => void;
  setLineDiscount: (lineId: string, type: 'none' | 'percentage' | 'fixed', value: number) => void;
  setCartDiscount: (type: 'none' | 'percentage' | 'fixed', value: number) => void;
  attachCustomer: (customerId: string, customerName: string, vehicleId?: string) => void;
  detachCustomer: () => void;
  setPaymentMethod: (method: 'CASH' | 'CARD' | 'QRPH' | 'GCASH' | 'MAYA') => void;
  setCashTendered: (amount: number) => void;
  setNote: (note: string) => void;
  clear: () => void;
}

type CartState = CartStateData & CartActions;

function computeLineTotal(line: Pick<CartLine, 'unitPrice' | 'quantity' | 'discountType' | 'discountValue'>): number {
  const gross = line.unitPrice * line.quantity;
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
    paymentMethod: state.paymentMethod,
    cashTendered: state.cashTendered,
    note: state.note,
  });
}

/**
 * Load persisted cart from MMKV on app startup.
 * Returns empty cart if no persisted state found.
 */
function loadPersistedCart(): CartStateData {
  const saved = getJSON<CartStateData>(storage, cartKey());
  if (saved && saved.lines && saved.lines.length > 0) return saved;
  return {
    lines: [],
    customerId: null,
    customerName: null,
    vehicleId: null,
    discountType: 'none',
    discountValue: 0,
    paymentMethod: 'CASH',
    cashTendered: 0,
    note: '',
  };
}

export const useCartStore = create<CartState>((set, get) => ({
  // Initialize from persisted state — cart survives app restart
  ...loadPersistedCart(),

  addLine: (product, qty = 1) => {
    set(state => {
      // If product already in cart, increment quantity
      const existing = state.lines.find(l => l.productId === product.serverId);
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

  setPaymentMethod: (method) => {
    set(state => {
      const newState = { ...state, paymentMethod: method };
      persist(newState);
      return { paymentMethod: method };
    });
  },

  setCashTendered: (amount) => {
    set(state => {
      const newState = { ...state, cashTendered: amount };
      persist(newState);
      return { cashTendered: amount };
    });
  },

  setNote: (note) => {
    set(state => {
      const newState = { ...state, note };
      persist(newState);
      return { note };
    });
  },

  clear: () => {
    const empty: CartStateData = {
      lines: [],
      customerId: null,
      customerName: null,
      vehicleId: null,
      discountType: 'none',
      discountValue: 0,
      paymentMethod: 'CASH',
      cashTendered: 0,
      note: '',
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

export const selectChange = (state: CartState): number =>
  state.cashTendered - selectGrandTotal(state);

export const selectLineCount = (state: CartState): number =>
  state.lines.reduce((sum, l) => sum + l.quantity, 0);
