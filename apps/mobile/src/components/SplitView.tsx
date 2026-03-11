import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { colors } from '@/theme';

interface SplitViewProps {
  /** Left/primary pane (typically wider) */
  primary: React.ReactNode;
  /** Right/secondary pane */
  secondary: React.ReactNode;
  /** Width ratio for primary pane (0-1). Default 0.6 */
  primaryRatio?: number;
  style?: ViewStyle;
}

/**
 * Horizontal split view for tablet layouts.
 * Shows primary (left) and secondary (right) side by side
 * with a 1px divider between them.
 */
export function SplitView({
  primary,
  secondary,
  primaryRatio = 0.6,
  style,
}: SplitViewProps) {
  return (
    <View style={[styles.container, style]}>
      <View style={[styles.pane, { flex: primaryRatio }]}>
        {primary}
      </View>
      <View style={styles.divider} />
      <View style={[styles.pane, { flex: 1 - primaryRatio }]}>
        {secondary}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
  },
  pane: {
    flex: 1,
  },
  divider: {
    width: 1,
    backgroundColor: colors.border.default,
  },
});
