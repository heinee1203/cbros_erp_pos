import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
  SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useAuth } from '@/hooks/use-auth';
import { getSyncStatus } from '@/sync/sync-manager';
import { runFullSync } from '@/sync/sync-manager';
import { getPendingSales } from '@/storage/pending-sales';
import { reconcilePendingSales } from '@/hooks/use-checkout';
import { storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';
import type { SettingsStackParamList } from '@/app/MainTabs';
import { useLayout } from '@/hooks/use-layout';
import { colors, textStyles, spacing, layout } from '@/theme';
import { Button, Card } from '@/components/ui';

type Nav = StackNavigationProp<SettingsStackParamList, 'SettingsHome'>;

function fmtSyncTime(ts: string | null): string {
  if (!ts) return 'Never';
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return new Date(ts).toLocaleTimeString();
}

export default function SettingsScreen() {
  const navigation = useNavigation<Nav>();
  const { isTablet, screenPadding } = useLayout();
  const { user, logout, locations, locationId, setLocationId } = useAuth();
  const syncStatus = getSyncStatus();
  const pendingSales = getPendingSales();
  const apiUrl = storage.getString(KEYS.API_BASE_URL) || 'Not set';
  const scannerMode = storage.getString(KEYS.SCANNER_MODE) || 'hid';

  const [syncing, setSyncing] = React.useState(false);

  const handleSync = async () => {
    setSyncing(true);
    await runFullSync();
    setSyncing(false);
    Alert.alert('Sync Complete', 'Catalog and inventory updated.');
  };

  const handleReconcile = async () => {
    await reconcilePendingSales();
    Alert.alert('Reconciliation Complete', 'Pending sales have been processed.');
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  const currentLocation = locations.find(l => l.id === locationId);

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.header, { paddingHorizontal: screenPadding }]}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={[
        styles.scrollContent,
        { paddingHorizontal: screenPadding },
        isTablet && styles.tabletContent,
      ]}>
        {/* Account */}
        <Card style={styles.card}>
          <Text style={styles.sectionLabel}>ACCOUNT</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>User</Text>
            <Text style={styles.rowValue}>{user?.fullName || '—'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Role</Text>
            <Text style={styles.rowValue}>{user?.role || '—'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Location</Text>
            <Text style={styles.rowValue}>{currentLocation?.name || '—'}</Text>
          </View>
        </Card>

        {/* Sync */}
        <Card style={styles.card}>
          <Text style={styles.sectionLabel}>SYNC</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Last catalog sync</Text>
            <Text style={styles.rowValue}>{fmtSyncTime(syncStatus.lastCatalogSync)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Last inventory sync</Text>
            <Text style={styles.rowValue}>{fmtSyncTime(syncStatus.lastInventorySync)}</Text>
          </View>
          <View style={styles.buttonRow}>
            <Button
              title={syncing ? 'Syncing...' : 'Sync Now'}
              onPress={handleSync}
              variant="secondary"
              disabled={syncing}
              loading={syncing}
              fullWidth
            />
          </View>
        </Card>

        {/* Pending Sales */}
        {pendingSales.length > 0 && (
          <Card style={styles.card}>
            <Text style={styles.sectionLabel}>PENDING SALES</Text>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Count</Text>
              <Text style={[styles.rowValue, { color: colors.status.warning }]}>
                {pendingSales.length}
              </Text>
            </View>
            <View style={styles.buttonRow}>
              <Button
                title="Reconcile Now"
                onPress={handleReconcile}
                variant="primary"
                fullWidth
              />
            </View>
          </Card>
        )}

        {/* Hardware */}
        <Card style={styles.card}>
          <Text style={styles.sectionLabel}>HARDWARE</Text>
          <Pressable
            style={styles.navRow}
            onPress={() => navigation.navigate('PrinterSetup')}
            android_ripple={{ color: colors.accent.glow }}
          >
            <Text style={styles.navRowText}>Printer Setup</Text>
            <Text style={styles.navArrow}>→</Text>
          </Pressable>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Scanner mode</Text>
            <Text style={styles.rowValue}>{scannerMode.toUpperCase()}</Text>
          </View>
        </Card>

        {/* Device */}
        <Card style={styles.card}>
          <Text style={styles.sectionLabel}>DEVICE</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>API URL</Text>
            <Text style={styles.rowValue} numberOfLines={1}>{apiUrl}</Text>
          </View>
        </Card>

        {/* Sign Out */}
        <View style={styles.signOutContainer}>
          <Button
            title="Sign Out"
            onPress={handleLogout}
            variant="danger"
            fullWidth
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  header: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: layout.headerPaddingTop,
    paddingBottom: layout.headerPaddingBottom,
  },
  headerTitle: {
    ...textStyles.heading,
    color: colors.text.primary,
  },
  scrollContent: {
    paddingBottom: spacing['3xl'],
  },
  tabletContent: {
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
  },
  card: {
    marginBottom: spacing.md,
  },
  sectionLabel: {
    ...textStyles.caption,
    color: colors.accent.primary,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  rowLabel: {
    ...textStyles.body,
    color: colors.text.secondary,
  },
  rowValue: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    flexShrink: 1,
    textAlign: 'right',
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  navRowText: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
  },
  navArrow: {
    ...textStyles.body,
    color: colors.text.muted,
  },
  buttonRow: {
    marginTop: spacing.md,
  },
  signOutContainer: {
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
});
