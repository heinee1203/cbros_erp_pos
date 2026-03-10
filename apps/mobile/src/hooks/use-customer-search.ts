import { useState, useCallback, useRef } from 'react';
import { apiFetch } from '@/services/api-client';

export interface Customer {
  id: string;
  name: string;
  phone: string;
}

export interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number | null;
  plateNo: string | null;
}

export function useCustomerSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Record<string, Vehicle[]>>({});
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const search = useCallback((q: string) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await apiFetch<{ customers: Customer[] }>(
          `/customers/search?q=${encodeURIComponent(q)}`,
        );
        setResults(data.customers ?? []);
      } catch {
        setResults([]);
      }
      setLoading(false);
    }, 300);
  }, []);

  const fetchVehicles = useCallback(async (customerId: string): Promise<Vehicle[]> => {
    if (vehicles[customerId]) return vehicles[customerId];
    try {
      const data = await apiFetch<{ vehicles: Vehicle[] }>(
        `/customers/${customerId}/vehicles`,
      );
      const v = data.vehicles ?? [];
      setVehicles(prev => ({ ...prev, [customerId]: v }));
      return v;
    } catch {
      return [];
    }
  }, [vehicles]);

  const clear = useCallback(() => {
    setQuery('');
    setResults([]);
    setLoading(false);
  }, []);

  return { query, results, loading, search, fetchVehicles, vehicles, clear };
}
