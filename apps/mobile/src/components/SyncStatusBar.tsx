import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { getSyncStatus } from '@/sync/sync-manager';
import { colors, textStyles, spacing } from '@/theme';

/**
 * Calm sync UX:
 * - Online + recently synced -> nothing shown (clean UI)
 * - Online + stale (>5 min since sync) -> subtle text "Last sync: Xm ago"
 * - Offline -> amber bar "Offline -- working from local data"
 * - Reconnecting -> blue bar "Reconnecting..."
 */
export default function SyncStatusBar() {
  const { isOnline, isReconnecting } = useNetworkStatus();
  const syncStatus = getSyncStatus();

  if (isReconnecting) {
    return (
      <View style={[styles.bar, styles.reconnecting]}>
        <Text style={[styles.baseText, styles.reconnectingText]}>Reconnecting...</Text>
      </View>
    );
  }

  if (!isOnline) {
    return (
      <View style={[styles.bar, styles.offline]}>
        <Text style={[styles.baseText, styles.offlineText]}>
          Offline — working from local data
        </Text>
      </View>
    );
  }

  // Online — check if stale (>5 min since last sync)
  const lastSync = syncStatus.lastInventorySync || syncStatus.lastCatalogSync;
  if (lastSync) {
    const ageMs = Date.now() - new Date(lastSync).getTime();
    if (ageMs > 5 * 60 * 1000) {
      const mins = Math.floor(ageMs / 60_000);
      return (
        <View style={[styles.bar, styles.stale]}>
          <Text style={[styles.baseText, styles.staleText]}>
            Last sync: {mins}m ago
          </Text>
        </View>
      );
    }
  }

  // Online and fresh — show nothing
  return null;
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  baseText: {
    ...textStyles.captionSmall,
    textAlign: 'center',
  },
  offline: {
    backgroundColor: colors.sync.offlineBg,
  },
  offlineText: {
    color: colors.sync.offlineText,
  },
  reconnecting: {
    backgroundColor: colors.sync.reconnectBg,
  },
  reconnectingText: {
    color: colors.sync.reconnectText,
  },
  stale: {
    backgroundColor: colors.sync.staleBg,
  },
  staleText: {
    color: colors.sync.staleText,
  },
});
