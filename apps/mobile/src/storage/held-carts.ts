import { storage, getJSON, setJSON } from './mmkv';
import { KEYS } from './keys';
import { getLockedLocationId } from '@/config/device-binding';

const KEY_PREFIX = 'held_carts';
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
  note?: string;
  heldAt: string;            // ISO timestamp
  totalAmount: number;
}

function currentLocationId(): string | null {
  return getLockedLocationId() ?? storage.getString(KEYS.AUTH_LOCATION_ID) ?? null;
}

function heldCartKey(): string {
  const locationId = currentLocationId();
  return locationId ? `${KEY_PREFIX}.${locationId}` : KEY_PREFIX;
}

function sortHeldCarts(carts: HeldCart[]): HeldCart[] {
  return [...carts].sort((a, b) => new Date(b.heldAt).getTime() - new Date(a.heldAt).getTime());
}

/**
 * Get all held carts, sorted newest first.
 */
export function getHeldCarts(): HeldCart[] {
  const key = heldCartKey();
  const carts = getJSON<HeldCart[]>(storage, key);
  if (carts) return sortHeldCarts(carts);

  const locationId = currentLocationId();
  const legacyCarts = locationId ? getJSON<HeldCart[]>(storage, KEY_PREFIX) : null;
  if (legacyCarts?.length) {
    setJSON(storage, key, legacyCarts);
    storage.delete(KEY_PREFIX);
    return sortHeldCarts(legacyCarts);
  }

  return [];
}

/**
 * Save a cart as held.
 * Returns false if maximum held carts reached.
 */
export function addHeldCart(cart: HeldCart): boolean {
  const current = getHeldCarts();
  if (current.length >= MAX_HELD) return false;
  current.push(cart);
  setJSON(storage, heldCartKey(), current);
  return true;
}

/**
 * Remove a held cart by ID.
 */
export function removeHeldCart(id: string): void {
  const current = getHeldCarts().filter(c => c.id !== id);
  setJSON(storage, heldCartKey(), current);
}

/**
 * Get count of held carts.
 */
export function getHeldCartCount(): number {
  return getHeldCarts().length;
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
