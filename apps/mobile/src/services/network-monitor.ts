import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { runFullSync } from '@/sync/sync-manager';
import { reconcilePendingSales } from '@/hooks/use-checkout';
import { getPendingSales } from '@/storage/pending-sales';

export interface NetworkStatus {
  isOnline: boolean;
  isReconnecting: boolean;
}

let _status: NetworkStatus = { isOnline: true, isReconnecting: false };
let _listeners: Array<(status: NetworkStatus) => void> = [];
let _wasOffline = false;
let _isFirstEvent = true;

function notify() {
  _listeners.forEach(fn => fn({ ..._status }));
}

export function getNetworkStatus(): NetworkStatus {
  return { ..._status };
}

export function onNetworkStatus(listener: (status: NetworkStatus) => void): () => void {
  _listeners.push(listener);
  return () => {
    _listeners = _listeners.filter(fn => fn !== listener);
  };
}

export function startNetworkMonitor(): () => void {
  const unsubscribe = NetInfo.addEventListener(async (state: NetInfoState) => {
    const isOnline = !!(state.isConnected && state.isInternetReachable !== false);

    if (!isOnline) {
      _wasOffline = true;
      _isFirstEvent = false;
      _status = { isOnline: false, isReconnecting: false };
      notify();
      return;
    }

    // On cold start: check for pending sales from a previous session
    const needsStartupReconcile = _isFirstEvent && getPendingSales().length > 0;
    _isFirstEvent = false;

    // Came back online (or cold start with pending sales)
    if (_wasOffline || needsStartupReconcile) {
      _wasOffline = false;
      _status = { isOnline: true, isReconnecting: true };
      notify();

      try {
        // Reconcile pending sales first, then sync
        await reconcilePendingSales();
        await runFullSync();
      } catch {
        // Best effort — don't crash on reconnect
      }

      _status = { isOnline: true, isReconnecting: false };
      notify();
    } else {
      _status = { isOnline: true, isReconnecting: false };
      notify();
    }
  });

  return unsubscribe;
}
