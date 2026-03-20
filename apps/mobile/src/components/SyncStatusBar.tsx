import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { getSyncStatus } from '@/sync/sync-manager';
import { runFullSync } from '@/sync/sync-manager';
import { colors, textStyles, spacing } from '@/theme';

type Urgency = 'fresh' | 'stale' | 'critical';

function getSyncUrgency(lastSyncAt: string | null): Urgency {
  if (!lastSyncAt) return 'critical';
  const minutesAgo = (Date.now() - new Date(lastSyncAt).getTime()) / 60000;
  if (minutesAgo < 5) return 'fresh';
  if (minutesAgo < 30) return 'stale';
  return 'critical';
}

function formatTimeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
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
  const syncStatus = getSyncStatus();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const lastSync = syncStatus.lastInventorySync || syncStatus.lastCatalogSync;
  const urgency = getSyncUrgency(lastSync);

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

  // Online — show urgency-based sync status
  const syncColors = URGENCY_COLORS[urgency];
  const timeAgo = lastSync ? formatTimeAgo(lastSync) : null;

  if (urgency === 'fresh') {
    // Fresh — show nothing (clean UI)
    return null;
  }

  return (
    <View style={[styles.bar, { backgroundColor: syncColors.bg }]}>
      <Animated.View style={[styles.dot, { backgroundColor: syncColors.dot, opacity: pulseAnim }]} />
      <Text style={[styles.text, { color: syncColors.text }]}>
        {timeAgo}
      </Text>
      {urgency === 'critical' && (
        <Pressable
          style={styles.syncNowBtn}
          onPress={() => runFullSync()}
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
