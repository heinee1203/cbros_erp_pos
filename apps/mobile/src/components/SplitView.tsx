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
      <View style={[styles.pane, secondaryCollapsed ? { flex: 1 } : { flex: primaryRatio }]}>
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
        <View style={[styles.pane, { flex: 1 - primaryRatio }]}>
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
    backgroundColor: '#F5A623',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  collapsedBadgeText: {
    fontSize: 11,
    fontFamily: 'Outfit-Bold',
    color: '#1A1A1A',
  },
});
