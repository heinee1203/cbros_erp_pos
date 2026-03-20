import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { colors, textStyles, spacing } from '@/theme';

/**
 * Persistent banner shown when the device has no internet connectivity.
 * Hidden when online — the SyncStatusBar handles reconnection UI.
 */
export const NetworkBanner: React.FC = () => {
  const styles = createStyles();
  const { isOnline, isReconnecting } = useNetworkStatus();

  // Don't show if online or if SyncStatusBar is already showing "Reconnecting..."
  if (isOnline || isReconnecting) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>No internet — sales will be saved offline</Text>
    </View>
  );
};

const createStyles = () => StyleSheet.create({
  banner: {
    backgroundColor: colors.status.warningBg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  text: {
    ...textStyles.captionSmall,
    color: colors.status.warning,
    fontWeight: '600',
  },
});
