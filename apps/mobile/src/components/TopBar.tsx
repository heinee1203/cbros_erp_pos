/**
 * Persistent top app bar — rendered above the tab navigator on all screens.
 *
 * Matches the Base44 reference design:
 *   Left:   "CB" blue circle (#1E40AF) + "C-BROS" white text
 *   Center: branch name from auth context + "▼" chevron (tappable)
 *   Right:  sync status dot (green/orange/red) + wifi icon
 *
 * Height: 48dp. Background: bg.base (#0F172A).
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '@/theme';
import { usePosLocation } from '@/hooks/use-pos-location';

const BRAND_BLUE = '#1E40AF';
const TOP_BAR_HEIGHT = 48;

export function TopBar() {
  const { locationName } = usePosLocation();
  const branchName = locationName || 'Main Branch';

  return (
    <View style={styles.container}>
      {/* Left: logo */}
      <View style={styles.left}>
        <View style={styles.logoBadge}>
          <Text style={styles.logoText}>CB</Text>
        </View>
        <Text style={styles.brandName}>C-BROS</Text>
      </View>

      {/* Center: branch selector */}
      <TouchableOpacity style={styles.branchPill} activeOpacity={0.7}>
        <View style={styles.onlineDot} />
        <Text style={styles.branchText}>{branchName}</Text>
        <Text style={styles.chevron}>▼</Text>
      </TouchableOpacity>

      {/* Right: sync indicator */}
      <View style={styles.right}>
        <View style={[styles.syncDot, { backgroundColor: '#22C55E' }]} />
        <Text style={styles.wifiIcon}>📶</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: TOP_BAR_HEIGHT,
    backgroundColor: colors.bg.base,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  logoBadge: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: BRAND_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  brandName: {
    color: colors.text.primary,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  branchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.bg.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22C55E',
  },
  branchText: {
    color: colors.text.primary,
    fontSize: 13,
    fontWeight: '500',
  },
  chevron: {
    color: colors.text.muted,
    fontSize: 8,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    justifyContent: 'flex-end',
  },
  syncDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  wifiIcon: {
    fontSize: 16,
  },
});
