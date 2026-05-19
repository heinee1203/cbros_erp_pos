import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, Alert } from 'react-native';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { getSyncStatus, onSyncStatus, runFullSync } from '@/sync/sync-manager';
import { formatPosError } from '@/utils/pos-error-messages';
import { colors, textStyles, spacing } from '@/theme';

type Urgency = 'fresh' | 'stale' | 'critical';

const FRESH_MINUTES = 15;
const CRITICAL_MINUTES = 120;

function getSyncUrgency(lastSyncAt: string | null): Urgency {
  if (!lastSyncAt) return 'critical';
  const syncTime = new Date(lastSyncAt).getTime();
  if (!Number.isFinite(syncTime)) return 'critical';
  const minutesAgo = (Date.now() - syncTime) / 60000;
  if (minutesAgo < FRESH_MINUTES) return 'fresh';
  if (minutesAgo < CRITICAL_MINUTES) return 'stale';
  return 'critical';
}

function formatTimeAgo(ts: string | null): string | null {
  if (!ts) return null;
  const diff = Date.now() - new Date(ts).getTime();
  if (!Number.isFinite(diff)) return null;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function buildSyncMessage(inventorySync: string | null, catalogSync: string | null): string {
  const inventoryAge = formatTimeAgo(inventorySync);
  if (inventoryAge) return `Inventory ${inventoryAge} old`;

  const catalogAge = formatTimeAgo(catalogSync);
  if (catalogAge) return `Inventory not synced / catalog ${catalogAge} old`;

  return 'Inventory sync has not completed';
}

const URGENCY_COLORS = {
  fresh: {
    text: colors.status.success,
    bg: 'transparent',
    dot: colors.status.success,
  },
  stale: {
    text: colors.status.warning,
    bg: colors.status.warningBg,
    dot: colors.status.warning,
  },
  critical: {
    text: colors.status.danger,
    bg: colors.status.dangerBg,
    dot: colors.status.danger,
  },
};

export default function SyncStatusBar() {
  const styles = createStyles();
  const { isOnline, isReconnecting } = useNetworkStatus();
  const [syncStatus, setSyncStatus] = useState(() => getSyncStatus());
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const urgency = getSyncUrgency(syncStatus.lastInventorySync);

  useEffect(() => {
    const unsubscribe = onSyncStatus(setSyncStatus);
    return unsubscribe;
  }, []);

  const handleSyncNow = useCallback(async () => {
    const result = await runFullSync();
    if (result.error) {
      Alert.alert('Sync Failed', formatPosError(result.error, 'Catalog and inventory could not be updated.'));
    }
  }, []);

  useEffect(() => {
    if (urgency === 'critical' && isOnline) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.4,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [urgency, isOnline, pulseAnim]);

  if (isReconnecting) {
    return (
      <View style={[styles.bar, { backgroundColor: colors.sync.reconnectBg }]}>
        <View style={[styles.dot, { backgroundColor: colors.sync.reconnectText }]} />
        <Text style={[styles.text, { color: colors.sync.reconnectText }]}>Reconnecting...</Text>
      </View>
    );
  }

  if (!isOnline) {
    return (
      <View style={[styles.bar, { backgroundColor: colors.sync.offlineBg }]}>
        <View style={[styles.dot, { backgroundColor: colors.sync.offlineText }]} />
        <Text style={[styles.text, { color: colors.sync.offlineText }]}>
          Offline {'\u2014'} working from local data
        </Text>
      </View>
    );
  }

  if (syncStatus.isSyncing) {
    const progress = syncStatus.progress;
    const phase = progress?.phase === 'inventory' ? 'inventory' : 'catalog';
    return (
      <View style={[styles.bar, { backgroundColor: colors.accent.muted }]}>
        <Animated.View style={[styles.dot, { backgroundColor: colors.accent.primary, opacity: pulseAnim }]} />
        <Text style={[styles.text, { color: colors.accent.primary }]}>
          Syncing {phase}{progress ? `: ${progress.synced.toLocaleString()} records` : '...'}
        </Text>
        {syncStatus.lastAttemptStartedAt ? (
          <Text style={styles.metaText}>Started {formatTimeAgo(syncStatus.lastAttemptStartedAt) || 'now'}</Text>
        ) : null}
      </View>
    );
  }

  // Online: show urgency-based sync status
  const syncColors = URGENCY_COLORS[urgency];
  const message = syncStatus.error
    ? `Last sync failed: ${formatPosError(syncStatus.error)}`
    : buildSyncMessage(syncStatus.lastInventorySync, syncStatus.lastCatalogSync);

  if (urgency === 'fresh') {
    // Fresh sync: keep the POS surface clean.
    return null;
  }

  return (
    <View style={[styles.bar, { backgroundColor: syncColors.bg }]}>
      <Animated.View style={[styles.dot, { backgroundColor: syncColors.dot, opacity: pulseAnim }]} />
      <Text style={[styles.text, { color: syncColors.text }]}>
        {message}
      </Text>
      {syncStatus.lastAttemptFinishedAt && syncStatus.error ? (
        <Text style={styles.metaText}>Tried {formatTimeAgo(syncStatus.lastAttemptFinishedAt) || 'recently'}</Text>
      ) : null}
      {(urgency === 'critical' || syncStatus.error) && (
        <Pressable
          style={styles.syncNowBtn}
          onPress={handleSyncNow}
          android_ripple={{ color: colors.accent.glow }}
        >
          <Text style={styles.syncNowText}>Sync Now</Text>
        </Pressable>
      )}
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  text: {
    ...textStyles.captionSmall,
    flex: 1,
  },
  metaText: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
  },
  syncNowBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(255,59,48,0.15)',
  },
  syncNowText: {
    fontSize: 11,
    fontFamily: 'Outfit-SemiBold',
    color: colors.status.danger,
  },
});
