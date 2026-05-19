import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getPendingSales, onPendingSalesChanged } from '@/storage/pending-sales';
import {
  getUnsyncedRegisterDrawerEvents,
  onRegisterDrawerEventsChanged,
} from '@/storage/register-drawer-events';
import { getPendingSaleReviewRows, summarizePendingSales } from '@/utils/pending-sale-summary';
import { getRegisterDrawerRecoveryRows, summarizeRegisterDrawerRecovery } from '@/utils/register-drawer-summary';
import { getSyncStatus, onSyncStatus, type SyncStatus } from '@/sync/sync-manager';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { formatPosError } from '@/utils/pos-error-messages';
import { openSyncRecovery as navigateToSyncRecovery } from '@/app/navigation-ref';
import { colors, fonts, fontSize, radius, spacing } from '@/theme';
import { Icon } from '@/components/ui';

type BannerTone = 'warning' | 'danger' | 'info';

function toneColors(tone: BannerTone) {
  if (tone === 'danger') {
    return {
      bg: colors.status.dangerBg,
      border: colors.status.danger,
      text: colors.status.dangerText,
      icon: colors.status.danger,
    };
  }
  if (tone === 'info') {
    return {
      bg: colors.status.infoBg,
      border: colors.status.info,
      text: colors.status.infoText,
      icon: colors.status.info,
    };
  }
  return {
    bg: colors.status.warningBg,
    border: colors.status.warning,
    text: colors.status.warningText,
    icon: colors.status.warning,
  };
}

export function RegisterRecoveryBanner() {
  const network = useNetworkStatus();
  const [pendingSales, setPendingSales] = useState(() => getPendingSales());
  const [pendingDrawerEvents, setPendingDrawerEvents] = useState(() => getUnsyncedRegisterDrawerEvents());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() => getSyncStatus());
  const styles = createStyles();

  useEffect(() => onPendingSalesChanged(setPendingSales), []);
  useEffect(() => onRegisterDrawerEventsChanged(() => {
    setPendingDrawerEvents(getUnsyncedRegisterDrawerEvents());
  }), []);
  useEffect(() => onSyncStatus(setSyncStatus), []);

  const summary = useMemo(() => summarizePendingSales(pendingSales), [pendingSales]);
  const previewRow = useMemo(() => getPendingSaleReviewRows(pendingSales, 1)[0], [pendingSales]);
  const drawerSummary = useMemo(
    () => summarizeRegisterDrawerRecovery(pendingDrawerEvents),
    [pendingDrawerEvents],
  );
  const drawerPreviewRow = useMemo(
    () => getRegisterDrawerRecoveryRows(pendingDrawerEvents, 1)[0],
    [pendingDrawerEvents],
  );

  const banner = useMemo(() => {
    if (summary.failed > 0) {
      return {
        tone: 'danger' as const,
        title: `${summary.failed} sale${summary.failed === 1 ? '' : 's'} need manager review`,
        detail: previewRow?.detail ?? 'Open Sync Recovery before closing the shift.',
        action: 'Review',
      };
    }

    if (summary.retryable > 0) {
      return {
        tone: 'warning' as const,
        title: `${summary.retryable} offline sale${summary.retryable === 1 ? '' : 's'} awaiting sync`,
        detail: network.isOnline
          ? `Oldest ${summary.oldestAgeLabel}. Reconcile before Z-reading.`
          : `Oldest ${summary.oldestAgeLabel}. Will retry when online.`,
        action: network.isOnline ? 'Sync' : 'Open',
      };
    }

    if (drawerSummary.failed > 0) {
      return {
        tone: 'danger' as const,
        title: `${drawerSummary.failed} drawer event${drawerSummary.failed === 1 ? '' : 's'} need manager retry`,
        detail: drawerPreviewRow?.detail ?? 'Open Sync Recovery before closing the shift.',
        action: 'Review',
      };
    }

    if (drawerSummary.retryable > 0) {
      return {
        tone: 'warning' as const,
        title: `${drawerSummary.retryable} drawer event${drawerSummary.retryable === 1 ? '' : 's'} awaiting sync`,
        detail: network.isOnline
          ? `Oldest ${drawerSummary.oldestAgeLabel}. Manager sync required.`
          : `Oldest ${drawerSummary.oldestAgeLabel}. Will retry when online.`,
        action: network.isOnline ? 'Sync' : 'Open',
      };
    }

    if (syncStatus.error) {
      return {
        tone: 'info' as const,
        title: 'Last sync attempt failed',
        detail: formatPosError(syncStatus.error, 'Catalog and inventory could not be updated.'),
        action: 'Retry',
      };
    }

    return null;
  }, [
    drawerPreviewRow?.detail,
    drawerSummary.failed,
    drawerSummary.oldestAgeLabel,
    drawerSummary.retryable,
    network.isOnline,
    previewRow?.detail,
    summary.failed,
    summary.oldestAgeLabel,
    summary.retryable,
    syncStatus.error,
  ]);

  const handleOpenSyncRecovery = useCallback(() => {
    navigateToSyncRecovery();
  }, []);

  if (!banner) return null;

  const tone = toneColors(banner.tone);

  return (
    <Pressable
      style={[styles.banner, { backgroundColor: tone.bg, borderColor: tone.border }]}
      onPress={handleOpenSyncRecovery}
      android_ripple={{ color: colors.accent.glow }}
    >
      <View style={styles.iconWrap}>
        <Icon name={banner.tone === 'info' ? 'sync' : 'alert'} size={18} color={tone.icon} />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: tone.text }]} numberOfLines={1}>{banner.title}</Text>
        <Text style={styles.detail} numberOfLines={1}>{banner.detail}</Text>
      </View>
      <Text style={[styles.action, { color: tone.text }]}>{banner.action}</Text>
      <Icon name="chevron-right" size={16} color={tone.text} />
    </Pressable>
  );
}

const createStyles = () => StyleSheet.create({
  banner: {
    minHeight: 50,
    borderBottomWidth: 1,
    borderTopWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    backgroundColor: colors.bg.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.sm,
  },
  detail: {
    color: colors.text.secondary,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  action: {
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
  },
});
