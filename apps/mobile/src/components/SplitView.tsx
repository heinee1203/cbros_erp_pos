import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors } from '@/theme';

interface SplitViewProps {
  primary: React.ReactNode;
  secondary: React.ReactNode;
  primaryRatio?: number;
  style?: ViewStyle;
  /** When true, the secondary pane collapses to a thin strip */
  secondaryCollapsed?: boolean;
}

export function SplitView({
  primary,
  secondary,
  primaryRatio = 0.6,
  style,
  secondaryCollapsed = false,
}: SplitViewProps) {
  return (
    <View style={[styles.container, style]}>
      <View style={[styles.pane, secondaryCollapsed ? { flex: 1 } : { flex: primaryRatio }]}>
        {primary}
      </View>
      <View style={styles.divider} />
      {secondaryCollapsed ? (
        <View style={styles.collapsedPane}>
          <Text style={styles.collapsedIcon}>{'\uD83D\uDED2'}</Text>
          <Text style={styles.collapsedLabel}>C</Text>
          <Text style={styles.collapsedLabel}>a</Text>
          <Text style={styles.collapsedLabel}>r</Text>
          <Text style={styles.collapsedLabel}>t</Text>
        </View>
      ) : (
        <View style={[styles.pane, { flex: 1 - primaryRatio }]}>
          {secondary}
        </View>
      )}
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
  collapsedPane: {
    width: 48,
    backgroundColor: colors.bg.elevated,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  collapsedIcon: {
    fontSize: 20,
    opacity: 0.4,
    marginBottom: 8,
  },
  collapsedLabel: {
    fontSize: 11,
    fontFamily: 'Outfit-Medium',
    color: colors.text.muted,
    letterSpacing: 1,
  },
});
