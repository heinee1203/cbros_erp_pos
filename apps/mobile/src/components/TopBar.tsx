import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/hooks/use-auth';
import { getDeviceBinding } from '@/config/device-binding';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { getSyncStatus, onSyncStatus, type SyncStatus } from '@/sync/sync-manager';
import { colors, fonts, fontSize, radius, spacing } from '@/theme';
import { useTheme } from '@/theme/ThemeContext';
import { Icon } from '@/components/ui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TOP_BAR_HEIGHT = 60;

export function TopBar() {
  useTheme();
  const { locations, locationId, deviceBinding } = useAuth();
  const network = useNetworkStatus();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() => getSyncStatus());
  const binding = deviceBinding ?? getDeviceBinding();
  const insets = useSafeAreaInsets();
  const styles = createStyles();

  useEffect(() => onSyncStatus(setSyncStatus), []);

  const currentLocation = useMemo(
    () => locations.find(location => location.id === locationId),
    [locations, locationId],
  );
  const locationLabel = currentLocation?.name
    ?? (binding?.locationId === locationId ? binding.locationName : null)
    ?? (locationId ? 'Branch unavailable offline' : 'Register device');

  const status = syncStatus.isSyncing
    ? { label: 'Syncing', color: colors.status.info, icon: 'sync' as const }
    : network.isReconnecting
      ? { label: 'Reconnecting', color: colors.status.warning, icon: 'sync' as const }
      : network.isOnline
        ? { label: 'Online', color: colors.status.success, icon: 'wifi' as const }
        : { label: 'Offline', color: colors.status.warning, icon: 'alert' as const };

  return (
    <View style={[styles.container, { height: TOP_BAR_HEIGHT + insets.top, paddingTop: insets.top }]}>
      <View style={styles.brand}>
        <View style={styles.logo}>
          <Text style={styles.logoText}>A</Text>
        </View>
        <View>
          <Text style={styles.brandTitle}>APEX POS</Text>
          <Text style={styles.brandSub}>C-BROS</Text>
        </View>
      </View>

      <View
        style={styles.locationButton}
      >
        <Icon name="location" size={16} color={colors.accent.primary} />
        <Text style={styles.locationText} numberOfLines={1}>
          {locationLabel}
        </Text>
        {binding ? <Text style={styles.lockedText}>Locked</Text> : null}
      </View>

      <View style={styles.statusPill}>
        <View style={[styles.statusDot, { backgroundColor: status.color }]} />
        <Icon name={status.icon} size={15} color={status.color} />
        <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
      </View>

    </View>
  );
}

const createStyles = () => StyleSheet.create({
  container: {
    height: TOP_BAR_HEIGHT,
    backgroundColor: colors.bg.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  brand: {
    minWidth: 164,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: '#172033',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    color: colors.white,
    fontFamily: fonts.display.extraBold,
    fontSize: fontSize.xl,
  },
  brandTitle: {
    color: colors.text.primary,
    fontFamily: fonts.display.bold,
    fontSize: fontSize.base,
  },
  brandSub: {
    color: colors.text.muted,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.xs,
    marginTop: 1,
  },
  locationButton: {
    flex: 1,
    minHeight: 40,
    maxWidth: 420,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.bg.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  locationText: {
    color: colors.text.primary,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.base,
    flexShrink: 1,
  },
  lockedText: {
    color: colors.text.secondary,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.xs,
    marginLeft: 'auto',
    textTransform: 'uppercase',
  },
  statusPill: {
    minWidth: 112,
    minHeight: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.bg.elevated,
    borderWidth: 1,
    borderColor: colors.border.default,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.sm,
  },
});
