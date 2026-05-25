import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { getHeldCartCount } from '@/storage/held-carts';
import { getPendingSales, onPendingSalesChanged } from '@/storage/pending-sales';
import {
  getUnsyncedRegisterDrawerEvents,
  onRegisterDrawerEventsChanged,
} from '@/storage/register-drawer-events';
import { getSyncStatus, onSyncStatus, type SyncStatus } from '@/sync/sync-manager';
import { colors, fonts, fontSize, radius, spacing } from '@/theme';
import { Icon, type IconName } from '@/components/ui';

interface MenuItem {
  icon: IconName;
  label: string;
  route: string;
  enabled: boolean;
  tone?: 'primary' | 'success' | 'warning' | 'neutral';
}

const MENU_ITEMS: MenuItem[] = [
  { icon: 'hold', label: 'Parked Orders', route: 'ParkedOrders', enabled: true, tone: 'warning' },
  { icon: 'receipt', label: 'Transactions', route: 'Transactions', enabled: true, tone: 'primary' },
  { icon: 'receipt', label: 'Shift History', route: 'ShiftHistory', enabled: true, tone: 'success' },
  { icon: 'cash', label: 'Register Tools', route: 'RegisterTools', enabled: true, tone: 'primary' },
  { icon: 'sync', label: 'Sync', route: 'SyncManagement', enabled: true, tone: 'primary' },
  { icon: 'printer', label: 'Printer Setup', route: 'PrinterSetup', enabled: true, tone: 'success' },
  { icon: 'settings', label: 'Settings', route: 'Settings', enabled: true, tone: 'neutral' },
  { icon: 'info', label: 'About', route: 'About', enabled: true, tone: 'neutral' },
  { icon: 'receipt', label: 'Returns', route: 'Returns', enabled: true, tone: 'primary' },
  { icon: 'barcode', label: 'Barcode Print', route: 'BarcodePrint', enabled: true, tone: 'success' },
  { icon: 'alert', label: 'Manager Audit', route: 'ManagerAudit', enabled: true, tone: 'warning' },
];

function toneColor(tone: MenuItem['tone']) {
  if (tone === 'success') return colors.status.success;
  if (tone === 'warning') return colors.status.warning;
  if (tone === 'primary') return colors.accent.primary;
  return colors.text.secondary;
}

function fmtSyncTime(ts: string | null): string {
  if (!ts) return 'Never';
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function readMetrics(): { syncStatus: SyncStatus; heldCount: number; pendingCount: number } {
  return {
    syncStatus: getSyncStatus(),
    heldCount: getHeldCartCount(),
    pendingCount: getPendingSales().length + getUnsyncedRegisterDrawerEvents().length,
  };
}

export default function MoreScreen() {
  const navigation = useNavigation<any>();
  const styles = createStyles();
  const [metrics, setMetrics] = useState(readMetrics);

  useEffect(() => onSyncStatus(syncStatus => {
    setMetrics({
      syncStatus,
      heldCount: getHeldCartCount(),
      pendingCount: getPendingSales().length + getUnsyncedRegisterDrawerEvents().length,
    });
  }), []);

  useEffect(() => onPendingSalesChanged(pendingSales => {
    setMetrics(prev => ({
      ...prev,
      heldCount: getHeldCartCount(),
      pendingCount: pendingSales.length + getUnsyncedRegisterDrawerEvents().length,
    }));
  }), []);

  useEffect(() => onRegisterDrawerEventsChanged(drawerEvents => {
    setMetrics(prev => ({
      ...prev,
      heldCount: getHeldCartCount(),
      pendingCount: getPendingSales().length + drawerEvents.filter(event => event.syncStatus !== 'synced' && !event.serverId).length,
    }));
  }), []);

  useFocusEffect(useCallback(() => {
    setMetrics(readMetrics());
  }, []));

  const { syncStatus, heldCount, pendingCount } = metrics;

  const handlePress = (item: MenuItem) => {
    if (!item.enabled) {
      Alert.alert(
        'Not Available',
        `${item.label} is not wired for mobile POS yet. It has been disabled here so cashiers do not enter a dead workflow.`,
      );
      return;
    }
    navigation.navigate(item.route);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      testID="more-menu-screen"
      accessibilityLabel="More menu"
    >
      <View style={styles.metrics}>
        <Metric label="Held" value={String(heldCount)} />
        <Metric label="Pending Sync" value={String(pendingCount)} tone={pendingCount > 0 ? 'warning' : 'default'} />
        <Metric label="Last Sync" value={fmtSyncTime(syncStatus.lastInventorySync)} />
      </View>

      <View style={styles.grid}>
        {MENU_ITEMS.map((item) => {
          const color = toneColor(item.tone);
          return (
            <Pressable
              key={item.route}
              testID={`more-menu-${item.route}`}
              accessibilityLabel={`${item.label} menu item`}
              style={({ pressed }) => [
                styles.card,
                !item.enabled && styles.cardDisabled,
                pressed && item.enabled && styles.cardPressed,
              ]}
              onPress={() => handlePress(item)}
              android_ripple={item.enabled ? { color: colors.accent.glow } : undefined}
            >
              <View style={[styles.iconBox, { backgroundColor: item.enabled ? `${color}1F` : colors.bg.elevated }]}>
                <Icon name={item.icon} size={22} color={item.enabled ? color : colors.text.muted} />
              </View>
              <Text style={[styles.cardLabel, !item.enabled && styles.cardLabelDisabled]} numberOfLines={2}>
                {item.label}
              </Text>
              {!item.enabled && <Text style={styles.disabledLabel}>Disabled</Text>}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

function Metric({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'warning';
}) {
  const styles = createStyles();
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, tone === 'warning' && styles.metricWarning]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 90,
  },
  metrics: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  metric: {
    flex: 1,
    minHeight: 66,
    borderRadius: radius.md,
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    justifyContent: 'center',
  },
  metricLabel: {
    color: colors.text.muted,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.xs,
  },
  metricValue: {
    color: colors.text.primary,
    fontFamily: fonts.display.bold,
    fontSize: fontSize['2xl'],
    marginTop: 2,
  },
  metricWarning: {
    color: colors.status.warning,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  card: {
    width: '31.5%',
    minHeight: 112,
    borderRadius: radius.md,
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    padding: spacing.md,
    justifyContent: 'space-between',
  },
  cardPressed: {
    backgroundColor: colors.accent.muted,
  },
  cardDisabled: {
    opacity: 0.58,
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: {
    color: colors.text.primary,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.base,
    lineHeight: 18,
  },
  cardLabelDisabled: {
    color: colors.text.secondary,
  },
  disabledLabel: {
    color: colors.text.muted,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.xs,
  },
});
