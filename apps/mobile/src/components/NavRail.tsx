import React from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { colors } from '@/theme';
import { useAuth } from '@/hooks/use-auth';

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

      {/* User/branch at bottom */}
      <Pressable style={styles.userIndicator} onPress={handleUserPress}>
        <View style={styles.userAvatar}>
          <Text style={styles.userInitials}>{initials}</Text>
        </View>
        {branchAbbrev ? (
          <Text style={styles.branchAbbrev}>{branchAbbrev}</Text>
        ) : null}
      </Pressable>
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
    borderRightColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  brandMark: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#F5A623',
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandText: {
    fontSize: 18,
    fontFamily: 'Outfit-Bold',
    color: '#1A1A1A',
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
    backgroundColor: 'rgba(245,166,35,0.15)',
  },
  activeIndicator: {
    position: 'absolute',
    left: -4,
    width: 4,
    height: 28,
    backgroundColor: '#F5A623',
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },
  navIcon: {
    fontSize: 20,
    color: '#5A5750',
  },
  navIconActive: {
    color: '#F5A623',
  },
  userIndicator: {
    alignItems: 'center',
    gap: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
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
    color: '#9B978F',
  },
  branchAbbrev: {
    fontSize: 8,
    fontFamily: 'Outfit-Medium',
    color: '#5A5750',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
