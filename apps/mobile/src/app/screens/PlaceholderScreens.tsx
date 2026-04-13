/**
 * Placeholder screens for More menu items that don't have full implementations yet.
 *
 * Each screen is a polished dark-themed placeholder with back navigation,
 * relevant icon, title, and description of what the feature will do.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors } from '@/theme';

interface PlaceholderProps {
  icon: string;
  title: string;
  subtitle: string;
}

function PlaceholderLayout({ icon, title, subtitle }: PlaceholderProps) {
  const navigation = useNavigation();
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.backBtn}>
          <Text style={styles.backText}>{'\u2190'} Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={{ width: 60 }} />
      </View>
      <View style={styles.content}>
        <Text style={styles.icon}>{icon}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>COMING SOON</Text>
        </View>
      </View>
    </View>
  );
}

export function ParkedOrdersScreen() {
  return (
    <PlaceholderLayout
      icon={'\u23F8'}
      title="Parked Orders"
      subtitle="Resume held carts, manage parked orders, and clear expired holds"
    />
  );
}

export function ReturnsScreen() {
  return (
    <PlaceholderLayout
      icon={'\u21A9'}
      title="Returns & Refunds"
      subtitle="Process customer returns, issue refunds, and manage return inventory"
    />
  );
}

export function BarcodePrintScreen() {
  return (
    <PlaceholderLayout
      icon={'\uD83D\uDCF7'}
      title="Barcode Printing"
      subtitle="Print barcode and price labels for products using the ZD230 label printer"
    />
  );
}

export function ReportsScreen() {
  return (
    <PlaceholderLayout
      icon={'\uD83D\uDCCA'}
      title="Reports & Analytics"
      subtitle="View sales reports, stock velocity, margin analysis, and branch performance"
    />
  );
}

export function PriceManagementScreen() {
  return (
    <PlaceholderLayout
      icon={'\uD83D\uDCB0'}
      title="Price Management"
      subtitle="Update prices, manage price lists, and track price change history"
    />
  );
}

export function SuppliersScreen() {
  return (
    <PlaceholderLayout
      icon={'\uD83D\uDE9A'}
      title="Suppliers"
      subtitle="Manage supplier contacts, purchase orders, and receiving schedules"
    />
  );
}

export function UserRolesScreen() {
  return (
    <PlaceholderLayout
      icon={'\uD83D\uDC64'}
      title="Users & Roles"
      subtitle="Manage staff accounts, assign roles, and configure permissions"
    />
  );
}

export function SyncManagementScreen() {
  return (
    <PlaceholderLayout
      icon={'\uD83D\uDD04'}
      title="Sync Management"
      subtitle="View sync status, pending changes, force sync, and resolve conflicts"
    />
  );
}

export function AboutScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => {}} hitSlop={12} style={styles.backBtn}>
          <Text style={styles.backText}>{'\u2190'} Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>About</Text>
        <View style={{ width: 60 }} />
      </View>
      <View style={styles.content}>
        <View style={styles.logoBadge}>
          <Text style={styles.logoText}>CB</Text>
        </View>
        <Text style={styles.title}>CBROS ERP POS</Text>
        <Text style={styles.subtitle}>C-BROS Genuine Autoparts & Accessories, Inc.</Text>
        <View style={styles.infoCard}>
          <InfoRow label="Version" value="1.0.0" />
          <InfoRow label="Build" value="2026.04.13" />
          <InfoRow label="Platform" value="Android Tablet" />
          <InfoRow label="Branches" value="6 Active" />
        </View>
      </View>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.base,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  backBtn: {
    width: 60,
  },
  backText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent.primary,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  icon: {
    fontSize: 56,
    opacity: 0.4,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text.primary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 360,
  },
  badge: {
    marginTop: 8,
    backgroundColor: 'rgba(148,163,184,0.12)',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.text.muted,
    letterSpacing: 1.5,
  },
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#1E40AF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
  },
  infoCard: {
    marginTop: 24,
    backgroundColor: colors.bg.surface,
    borderRadius: 8,
    padding: 16,
    width: '100%',
    maxWidth: 320,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  infoLabel: {
    fontSize: 13,
    color: colors.text.muted,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.primary,
  },
});
