import { storage, getJSON, setJSON } from './mmkv';

const KEY = 'held_carts';
const MAX_HELD = 5;

export interface HeldCart {
  id: string;
  label: string;            // customer name or "Held #N"
  lines: any[];              // CartLine[] snapshot
  customerId: string | null;
  customerName: string | null;
  vehicleId: string | null;
  discountType: string;
  discountValue: number;
  heldAt: string;            // ISO timestamp
  totalAmount: number;
}

/**
 * Get all held carts, sorted newest first.
 */
export function getHeldCarts(): HeldCart[] {
  const carts = getJSON<HeldCart[]>(storage, KEY) ?? [];
  return carts.sort((a, b) => new Date(b.heldAt).getTime() - new Date(a.heldAt).getTime());
}

/**
 * Save a cart as held.
 * Returns false if maximum held carts reached.
 */
export function addHeldCart(cart: HeldCart): boolean {
  const current = getHeldCarts();
  if (current.length >= MAX_HELD) return false;
  current.push(cart);
  setJSON(storage, KEY, current);
  return true;
}

/**
 * Remove a held cart by ID.
 */
export function removeHeldCart(id: string): void {
  const current = getHeldCarts().filter(c => c.id !== id);
  setJSON(storage, KEY, current);
}

/**
 * Get count of held carts.
 */
export function getHeldCartCount(): number {
  return (getJSON<HeldCart[]>(storage, KEY) ?? []).length;
}

/**
 * Get the next label number (e.g. "Held #3").
 */
export function getNextHeldLabel(): string {
  const carts = getHeldCarts();
  const nums = carts
    .map(c => {
      const m = c.label.match(/^Held #(\d+)$/);
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter(n => n > 0);
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `Held #${next}`;
}
