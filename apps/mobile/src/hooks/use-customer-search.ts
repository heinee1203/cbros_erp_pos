import { useState, useCallback, useRef } from 'react';
import { apiFetch } from '@/services/api-client';

export interface Customer {
  id: string;
  name: string;
  phone: string;
  customerType?: string | null;
  creditLimit?: string | null;
  currentBalance?: string | null;
  paymentTermsDays?: number | null;
  isOverdue?: boolean;
  vehicleCount?: number;
  primaryPlateNo?: string | null;
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
  const [error, setError] = useState<string | null>(null);
  const [vehicleError, setVehicleError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const search = useCallback((q: string) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await apiFetch<{ data: Customer[] }>(
          `/customers/search?q=${encodeURIComponent(q)}`,
        );
        setResults(data.data ?? []);
      } catch (err: any) {
        setResults([]);
        setError(err.message || 'Unable to search customers');
      }
      setLoading(false);
    }, 300);
  }, []);

  const fetchVehicles = useCallback(async (customerId: string): Promise<Vehicle[]> => {
    if (vehicles[customerId]) return vehicles[customerId];
    setVehicleError(null);
    try {
      const data = await apiFetch<{ data: Vehicle[] }>(
        `/customers/${customerId}/vehicles`,
      );
      const v = data.data ?? [];
      setVehicles(prev => ({ ...prev, [customerId]: v }));
      return v;
    } catch (err: any) {
      setVehicleError(err.message || 'Unable to load customer vehicles');
      return [];
    }
  }, [vehicles]);

  const clear = useCallback(() => {
    setQuery('');
    setResults([]);
    setLoading(false);
    setError(null);
    setVehicleError(null);
  }, []);

  return { query, results, loading, error, vehicleError, search, fetchVehicles, vehicles, clear };
}
