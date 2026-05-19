import React from 'react';
import { View, Text, StyleSheet, Platform, ViewStyle } from 'react-native';
import { colors } from '@/theme';

interface SplitViewProps {
  primary: React.ReactNode;
  secondary: React.ReactNode;
  primaryRatio?: number;
  style?: ViewStyle;
  /** When true, the secondary pane collapses to a thin strip */
  secondaryCollapsed?: boolean;
  /** Badge count to show on collapsed strip */
  collapsedBadgeCount?: number;
}

export function SplitView({
  primary,
  secondary,
  primaryRatio = 0.6,
  style,
  secondaryCollapsed = false,
  collapsedBadgeCount = 0,
}: SplitViewProps) {
  const styles = createStyles();
  return (
    <View style={[styles.container, style]}>
      <View style={[styles.primaryPane, secondaryCollapsed ? { flex: 1 } : { flex: primaryRatio }]}>
        {primary}
      </View>
      <View style={styles.divider} />
      {secondaryCollapsed ? (
        <View style={styles.collapsedPane}>
          <Text style={styles.collapsedIcon}>{'\uD83D\uDED2'}</Text>
          {collapsedBadgeCount > 0 && (
            <View style={styles.collapsedBadge}>
              <Text style={styles.collapsedBadgeText}>{collapsedBadgeCount}</Text>
            </View>
          )}
        </View>
      ) : (
        <View style={[styles.secondaryPane, { flex: 1 - primaryRatio }]}>
          {secondary}
        </View>
      )}
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
  },
  primaryPane: {
    flex: 1,
    backgroundColor: colors.bg.base,
  },
  secondaryPane: {
    flex: 1,
    backgroundColor: colors.bg.surface,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: -2, height: 0 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  divider: {
    width: 1,
    backgroundColor: colors.border.default,
  },
  collapsedPane: {
    width: 48,
    backgroundColor: colors.bg.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: colors.border.subtle,
    gap: 6,
  },
  collapsedIcon: {
    fontSize: 22,
    opacity: 0.5,
  },
  collapsedBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.accent.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  collapsedBadgeText: {
    fontSize: 11,
    fontFamily: 'Outfit-Bold',
    color: colors.text.inverse,
  },
});
