import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/services/api-client';
import type { DotBatch } from '@/utils/dot-fifo-allocate';

/**
 * Fetch available DOT batches for a product at a location.
 * Returns batches sorted oldest-first (for FIFO).
 */
export function useDotBatches(productId: string | null, locationId: string | null) {
  const [batches, setBatches] = useState<DotBatch[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!productId || !locationId) {
      setBatches([]);
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch<{ data: DotBatch[] }>(
        `/inventory/dot-batches?productId=${productId}&locationId=${locationId}&inStock=true`,
      );
      setBatches(res.data ?? []);
    } catch {
      setBatches([]);
    } finally {
      setLoading(false);
    }
  }, [productId, locationId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { batches, loading, refetch: fetch };
}
