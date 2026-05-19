import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { colors } from '@/theme';
import { useAuth } from '@/hooks/use-auth';
import { usePosPermission } from '@/hooks/use-pos-permission';
import { getHeldCartCount } from '@/storage/held-carts';
import { HeldCartsSheet } from '@/components/HeldCartsSheet';

const TAB_ICONS: Record<string, string> = {
  POS: '\u229E',           // ⊞
  Transactions: '\uD83E\uDDFE',  // 🧾
  Settings: '\u2699',      // ⚙
};

/** Width of the navigation rail in dp */
export const NAV_RAIL_WIDTH = 52;

export function NavRail({ state, navigation }: BottomTabBarProps) {
  const styles = createStyles();
  const { user, logout, locations, locationId } = useAuth();
  const { can } = usePosPermission();
  const [heldCartsVisible, setHeldCartsVisible] = useState(false);

  // Re-read on each render (NavRail re-renders on tab changes)
  const heldCount = getHeldCartCount();

  const currentLocation = locations?.find((l: any) => l.id === locationId);
  const initials = user?.fullName
    ? user.fullName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
    : '?';
  const branchAbbrev = currentLocation?.name
    ? currentLocation.name.slice(0, 3).toUpperCase()
    : '';

  const handleUserPress = () => {
    Alert.alert(
      user?.fullName || 'User',
      `Role: ${user?.role || '—'}\nLocation: ${currentLocation?.name || '—'}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: logout },
      ],
    );
  };

  return (
    <View style={styles.navRail}>
      {/* Brand mark */}
      <View style={styles.brandMark}>
        <Text style={styles.brandText}>A</Text>
      </View>

      {/* Tab items */}
      <View style={styles.tabsContainer}>
        {state.routes.map((route, index) => {
          // Gate Settings tab behind posSettings permission
          if (route.name === 'Settings' && !can('posSettings')) return null;

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
            </Pressable>
          );
        })}
      </View>

      {/* Held carts indicator */}
      {heldCount > 0 && (
        <Pressable
          style={styles.heldCartsButton}
          onPress={() => setHeldCartsVisible(true)}
          android_ripple={{ color: colors.accent.glow, borderless: true }}
        >
          <Text style={styles.heldCartsIcon}>{'\u23F8'}</Text>
          <View style={styles.heldCartsBadge}>
            <Text style={styles.heldCartsBadgeText}>{heldCount}</Text>
          </View>
        </Pressable>
      )}

      {/* User/branch at bottom */}
      <Pressable style={styles.userIndicator} onPress={handleUserPress}>
        <View style={styles.userAvatar}>
          <Text style={styles.userInitials}>{initials}</Text>
        </View>
        {branchAbbrev ? (
          <Text style={styles.branchAbbrev}>{branchAbbrev}</Text>
        ) : null}
      </Pressable>

      <HeldCartsSheet
        visible={heldCartsVisible}
        onClose={() => setHeldCartsVisible(false)}
      />
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  navRail: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: NAV_RAIL_WIDTH,
    backgroundColor: colors.bg.base,
    borderRightWidth: 1,
    borderRightColor: colors.border.subtle,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  brandMark: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#1E3A8A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandText: {
    fontSize: 18,
    fontFamily: 'Outfit-Bold',
    color: colors.text.inverse,
  },
  tabsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  navTab: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
    position: 'relative',
  },
  navTabActive: {
    backgroundColor: colors.accent.glow,
  },
  activeIndicator: {
    position: 'absolute',
    left: -4,
    width: 4,
    height: 28,
    backgroundColor: colors.accent.primary,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },
  navIcon: {
    fontSize: 20,
    color: colors.text.muted,
  },
  navIconActive: {
    color: colors.accent.primary,
  },
  userIndicator: {
    alignItems: 'center',
    gap: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    width: '100%',
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.bg.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userInitials: {
    fontSize: 12,
    fontFamily: 'Outfit-Bold',
    color: colors.text.muted,
  },
  branchAbbrev: {
    fontSize: 8,
    fontFamily: 'Outfit-Medium',
    color: colors.text.muted,
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  heldCartsButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  heldCartsIcon: {
    fontSize: 18,
    color: colors.status.warning,
  },
  heldCartsBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.status.warning,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  heldCartsBadgeText: {
    fontSize: 9,
    fontFamily: 'Outfit-Bold',
    color: '#0F172A',
  },
});
