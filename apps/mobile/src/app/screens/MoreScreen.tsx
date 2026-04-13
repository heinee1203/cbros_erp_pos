/**
 * More Menu — 3-column grid of icon cards matching the Base44 reference.
 *
 * Quick stats banner at top (placeholder data), then a grid of menu items
 * that navigate to sub-screens. Items that don't have screens yet show
 * "Coming Soon" placeholders.
 */
import React from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors } from '@/theme';

interface MenuItem {
  icon: string;
  label: string;
  color: string;
  route: string;
}

const MENU_ITEMS: MenuItem[] = [
  { icon: '\u23F8', label: 'Parked Orders', color: '#F97316', route: 'ParkedOrders' },
  { icon: '\uD83D\uDCCB', label: 'Transactions', color: '#3B82F6', route: 'Transactions' },
  { icon: '\u21A9', label: 'Returns', color: '#EF4444', route: 'Returns' },
  { icon: '\uD83D\uDCF7', label: 'Barcode Print', color: '#22C55E', route: 'BarcodePrint' },
  { icon: '\uD83D\uDCCA', label: 'Reports', color: '#F59E0B', route: 'Reports' },
  { icon: '\uD83D\uDCB0', label: 'Price Mgmt', color: '#F59E0B', route: 'PriceManagement' },
  { icon: '\uD83D\uDE9A', label: 'Suppliers', color: '#22C55E', route: 'Suppliers' },
  { icon: '\uD83D\uDC64', label: 'Users & Roles', color: '#6B7280', route: 'UserRoles' },
  { icon: '\uD83D\uDD04', label: 'Sync', color: '#6B7280', route: 'SyncManagement' },
  { icon: '\uD83D\uDDA8', label: 'Printer Setup', color: '#22C55E', route: 'PrinterSetup' },
  { icon: '\u2699', label: 'Settings', color: '#6B7280', route: 'Settings' },
  { icon: '\u2139', label: 'About', color: '#6B7280', route: 'About' },
];

export default function MoreScreen() {
  const navigation = useNavigation<any>();

  const handlePress = (item: MenuItem) => {
    navigation.navigate(item.route);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* Quick stats banner */}
      <View style={styles.statsBanner}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Today's Sales</Text>
          <Text style={styles.statValue}>{'\u20B1'}0.00</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Transactions</Text>
          <Text style={styles.statValue}>0</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Pending Sync</Text>
          <Text style={styles.statValue}>0 items</Text>
        </View>
      </View>

      {/* Grid of menu items */}
      <View style={styles.grid}>
        {MENU_ITEMS.map((item, i) => (
          <Pressable
            key={i}
            style={styles.card}
            onPress={() => handlePress(item)}
            android_ripple={{ color: 'rgba(255,255,255,0.05)' }}
          >
            <Text style={[styles.cardIcon, { color: item.color }]}>{item.icon}</Text>
            <Text style={styles.cardLabel}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.base,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 80,
  },
  statsBanner: {
    flexDirection: 'row',
    backgroundColor: colors.bg.surface,
    borderRadius: 8,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.border.default,
    marginHorizontal: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  card: {
    width: '31%',
    backgroundColor: colors.bg.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingHorizontal: 8,
    gap: 8,
    position: 'relative',
  },
  cardIcon: {
    fontSize: 28,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.primary,
    textAlign: 'center',
  },
  comingSoonBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(148,163,184,0.15)',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  comingSoonText: {
    fontSize: 8,
    fontWeight: '700',
    color: colors.text.muted,
    textTransform: 'uppercase',
  },
});
