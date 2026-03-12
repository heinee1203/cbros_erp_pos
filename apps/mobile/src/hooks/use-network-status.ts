import { useState, useEffect } from 'react';
import { getNetworkStatus, onNetworkStatus } from '@/services/network-monitor';

// Re-export for convenience
export type { NetworkStatus } from '@/services/network-monitor';

export function useNetworkStatus() {
  const [status, setStatus] = useState(getNetworkStatus());

  useEffect(() => {
    const unsub = onNetworkStatus(setStatus);
    return unsub;
  }, []);

  return status;
}
