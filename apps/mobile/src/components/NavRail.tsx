import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { colors } from '@/theme';

const TAB_LABELS: Record<string, string> = {
  POS: 'POS',
  Transactions: 'Sales',
  Settings: 'Settings',
};

const TAB_ICONS: Record<string, string> = {
  POS: '\u229E',           // ⊞
  Transactions: '\u2630',  // ☰
  Settings: '\u2699',      // ⚙
};

/** Width of the navigation rail in dp */
export const NAV_RAIL_WIDTH = 72;

/**
 * Vertical navigation rail for tablet layout.
 * Replaces the bottom tab bar when screen width >= 768dp.
 * Premium dark design with amber brand mark and active indicators.
 * Receives BottomTabBarProps from the tabBar prop of Tab.Navigator.
 */
export function NavRail({ state, navigation }: BottomTabBarProps) {
  return (
    <View style={styles.navRail}>
      {/* Brand mark */}
      <View style={styles.brandMark}>
        <Text style={styles.brandText}>A</Text>
      </View>

      {/* Tab items */}
      {state.routes.map((route, index) => {
        const isActive = state.index === index;
        return (
          <Pressable
            key={route.key}
            style={[styles.navTab, isActive && styles.navTabActive]}
            onPress={() => navigation.navigate(route.name)}
            android_ripple={{ color: colors.accent.glow, borderless: false }}
          >
            {isActive && <View style={styles.activeIndicator} />}
            <Text style={[styles.navIcon, isActive && styles.navIconActive]}>
              {TAB_ICONS[route.name] || '\u25CB'}
            </Text>
            <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>
              {TAB_LABELS[route.name] || route.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  navRail: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: NAV_RAIL_WIDTH,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 16,
    alignItems: 'center',
    zIndex: 10,
  },
  brandMark: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#F5A623',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  brandText: {
    fontSize: 20,
    fontFamily: 'Outfit-Bold',
    color: '#1A1A1A',
  },
  navTab: {
    width: 64,
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    marginBottom: 8,
  },
  navTabActive: {
    backgroundColor: 'rgba(245,166,35,0.08)',
  },
  activeIndicator: {
    position: 'absolute',
    left: -4, // offset to align with navRail left edge (navTab is centered in 72px rail)
    width: 3,
    height: 32,
    backgroundColor: '#F5A623',
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },
  navIcon: {
    fontSize: 22,
    color: '#5A5750',
    marginBottom: 4,
  },
  navIconActive: {
    color: '#F5A623',
  },
  navLabel: {
    fontSize: 10,
    fontFamily: 'Outfit-Medium',
    color: '#5A5750',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  navLabelActive: {
    color: '#F5A623',
  },
});
