import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { colors, textStyles, spacing } from '@/theme';

const TAB_LABELS: Record<string, string> = {
  POS: 'POS',
  Transactions: 'Sales',
  Settings: 'Settings',
};

const TAB_ICONS: Record<string, string> = {
  POS: '\u2637',       // ☷ trigram
  Transactions: '\u2630', // ☰ trigram
  Settings: '\u2699',   // ⚙ gear
};

/** Width of the navigation rail in dp */
export const NAV_RAIL_WIDTH = 72;

/**
 * Vertical navigation rail for tablet layout.
 * Replaces the bottom tab bar when screen width >= 768dp.
 * Material Design 3 style: 72dp wide, icons + labels.
 * Receives BottomTabBarProps from the tabBar prop of Tab.Navigator.
 */
export function NavRail({ state, navigation }: BottomTabBarProps) {
  return (
    <View style={styles.container}>
      {/* Brand mark */}
      <View style={styles.brand}>
        <Text style={styles.brandText}>APEX</Text>
      </View>

      {/* Tab items */}
      <View style={styles.tabs}>
        {state.routes.map((route, index) => {
          const isActive = state.index === index;
          return (
            <Pressable
              key={route.key}
              style={[styles.tab, isActive && styles.activeTab]}
              onPress={() => navigation.navigate(route.name)}
              android_ripple={{ color: colors.accent.glow, borderless: false }}
            >
              <Text style={[styles.icon, isActive && styles.activeIcon]}>
                {TAB_ICONS[route.name] || '\u25CB'}
              </Text>
              <Text style={[styles.label, isActive && styles.activeLabel]}>
                {TAB_LABELS[route.name] || route.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: NAV_RAIL_WIDTH,
    backgroundColor: colors.bg.surface,
    borderRightWidth: 1,
    borderRightColor: colors.border.default,
    zIndex: 10,
  },
  brand: {
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  brandText: {
    fontFamily: textStyles.heading.fontFamily,
    fontSize: 14,
    color: colors.accent.primary,
    letterSpacing: 2,
  },
  tabs: {
    flex: 1,
    paddingTop: spacing.lg,
  },
  tab: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
    borderRadius: 8,
    marginBottom: 4,
  },
  activeTab: {
    backgroundColor: colors.accent.glow,
  },
  icon: {
    fontSize: 20,
    color: colors.text.muted,
    marginBottom: 2,
  },
  activeIcon: {
    color: colors.accent.primary,
  },
  label: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
    fontSize: 10,
  },
  activeLabel: {
    color: colors.accent.primary,
  },
});
