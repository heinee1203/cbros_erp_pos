/**
 * Client-side FIFO allocation preview for DOT batches.
 * Mirrors server-side sellDotBatchesFIFO logic.
 * Allocates from oldest batch first.
 */

export interface DotBatch {
  id: string;
  dotCode: string;
  manufactureDate: string | null;
  manufactureWeek: number | null;
  manufactureYear: number | null;
  quantityInStock: number;
}

export interface DotAllocation {
  dotBatchId: string;
  dotCode: string;
  quantity: number;
}

export function allocateFIFO(batches: DotBatch[], quantity: number): DotAllocation[] {
  // Batches should already be sorted oldest-first from the API
  let remaining = quantity;
  const allocation: DotAllocation[] = [];

  for (const batch of batches) {
    if (remaining <= 0) break;
    if (batch.quantityInStock <= 0) continue;

    const take = Math.min(remaining, batch.quantityInStock);
    allocation.push({
      dotBatchId: batch.id,
      dotCode: batch.dotCode,
      quantity: take,
    });
    remaining -= take;
  }

  return allocation;
}

/**
 * Format DOT batch info for display.
 * "DOT 2825 — Jul 2025 (9m)"
 */
export function formatDotAllocation(alloc: DotAllocation): string {
  const lastFour = alloc.dotCode.replace(/[^0-9]/g, '').slice(-4);
  if (lastFour.length === 4) {
    const wk = parseInt(lastFour.slice(0, 2), 10);
    const yr = 2000 + parseInt(lastFour.slice(2, 4), 10);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthIdx = Math.min(11, Math.floor((wk - 1) / 4.33));
    const now = new Date();
    const ageMonths = Math.max(0, (now.getFullYear() - yr) * 12 + now.getMonth() - monthIdx);
    const ageStr = ageMonths < 12 ? `${ageMonths}m` : `${Math.floor(ageMonths / 12)}y ${ageMonths % 12}m`;
    return `DOT ${lastFour} — ${months[monthIdx]} ${yr} (${ageStr})`;
  }
  return `DOT ${alloc.dotCode}`;
}
