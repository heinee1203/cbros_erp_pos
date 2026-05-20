import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
  SafeAreaView,
  Modal,
  TextInput,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useAuth } from '@/hooks/use-auth';
import { getSyncStatus } from '@/sync/sync-manager';
import { onSyncStatus, runFullSync, type SyncStatus } from '@/sync/sync-manager';
import { getPendingSales, onPendingSalesChanged } from '@/storage/pending-sales';
import { reconcilePendingSales } from '@/hooks/use-checkout';
import { storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';
import { apiFetch } from '@/services/api-client';
import { usePrinter } from '@/hardware/printer/context';
import { buildAuthorizationBadgeLabel } from '@/hardware/printer/zpl-label-builder';
import { printZplSafely } from '@/hardware/printer/settings';
import { LabelPreviewModal } from '@/components/LabelPreviewModal';
import { ManagerPinModal, type ManagerAuthorization } from '@/components/ManagerPinModal';
import {
  MANAGER_BADGE_TITLE,
  buildManagerBarcodeCredential,
  buildManagerCardCredential,
  isManagerAuthorizationPin,
  maskManagerCredential,
  normalizeManagerAuthorizationPin,
} from '@/utils/manager-authorization-badge';
import { formatPosError } from '@/utils/pos-error-messages';
import type { SettingsStackParamList } from '@/app/MainTabs';
import { useLayout } from '@/hooks/use-layout';
import { colors, textStyles, spacing, layout } from '@/theme';
import { Button, Card, Icon } from '@/components/ui';

type Nav = StackNavigationProp<SettingsStackParamList, 'SettingsHome'>;

function fmtSyncTime(ts: string | null): string {
  if (!ts) return 'Never';
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return new Date(ts).toLocaleTimeString();
}

function fmtAuthorizationMethod(method?: ManagerAuthorization['method']): string {
  switch (method) {
    case 'barcode': return 'Barcode';
    case 'card': return 'Card swipe';
    case 'pin': return 'PIN';
    default: return 'Not run';
  }
}

export default function SettingsScreen() {
  const navigation = useNavigation<Nav>();
  const { isTablet, screenPadding } = useLayout();
  const { user, logout, locations, locationId, deviceBinding } = useAuth();
  const printer = usePrinter();
  const [syncStatus, setSyncStatus] = React.useState<SyncStatus>(() => getSyncStatus());
  const [pendingSales, setPendingSales] = React.useState(() => getPendingSales());
  const apiUrl = storage.getString(KEYS.API_BASE_URL) || 'Not set';
  const scannerMode = storage.getString(KEYS.SCANNER_MODE) || 'hid';

  const [syncing, setSyncing] = React.useState(false);
  const [reconciling, setReconciling] = React.useState(false);
  const [pinModalVisible, setPinModalVisible] = React.useState(false);
  const [pinDraft, setPinDraft] = React.useState('');
  const [pinConfirm, setPinConfirm] = React.useState('');
  const [pinSaving, setPinSaving] = React.useState(false);
  const [pinError, setPinError] = React.useState('');
  const [badgePreviewVisible, setBadgePreviewVisible] = React.useState(false);
  const [badgePrinting, setBadgePrinting] = React.useState(false);
  const [authorizationTestVisible, setAuthorizationTestVisible] = React.useState(false);
  const [lastAuthorizationTest, setLastAuthorizationTest] = React.useState<{
    approverName: string;
    method: ManagerAuthorization['method'];
  } | null>(null);

  const styles = createStyles();

  React.useEffect(() => {
    const unsubscribe = onSyncStatus(setSyncStatus);
    return unsubscribe;
  }, []);

  React.useEffect(() => onPendingSalesChanged(setPendingSales), []);

  const refreshPendingSales = React.useCallback(() => {
    setPendingSales(getPendingSales());
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const status = await runFullSync();
      setSyncStatus(status);
      if (status.error) throw new Error(status.error);
      refreshPendingSales();
      Alert.alert('Sync Complete', 'Catalog and inventory updated.');
    } catch (err: any) {
      Alert.alert('Sync Failed', formatPosError(err, 'Catalog and inventory could not be updated.'));
    } finally {
      setSyncing(false);
    }
  };

  const handleReconcile = async () => {
    setReconciling(true);
    try {
      const summary = await reconcilePendingSales();
      refreshPendingSales();
      if (summary.failed > 0) {
        Alert.alert('Manager Review Needed', `${summary.failed} pending sale${summary.failed === 1 ? '' : 's'} need manual review.`);
      } else if (summary.blockedReason === 'store_lock') {
        Alert.alert(
          'Register Locked Store Required',
          formatPosError('Register this device to a store before processing pending sales.'),
        );
      } else if (summary.retryLater > 0) {
        Alert.alert('Still Offline', `${summary.retryLater} sale${summary.retryLater === 1 ? '' : 's'} will retry when the server is reachable.`);
      } else {
        Alert.alert('Reconciliation Complete', 'Pending sales have been processed.');
      }
    } catch (err: any) {
      Alert.alert('Reconciliation Failed', formatPosError(err, 'Pending sales could not be processed.'));
    } finally {
      setReconciling(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  const currentLocation = locations.find(l => l.id === locationId);
  const canManageAuthorization = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const pinReady = isManagerAuthorizationPin(pinDraft) && pinDraft === pinConfirm;
  const badgeCredential = pinReady ? buildManagerBarcodeCredential(pinDraft) : '';
  const cardCredential = pinReady ? buildManagerCardCredential(pinDraft) : '';
  const badgeZpl = React.useMemo(() => {
    if (!badgeCredential) return '';
    return buildAuthorizationBadgeLabel({
      credential: badgeCredential,
      fullName: user?.fullName,
      role: user?.role,
      locationName: currentLocation?.name,
    });
  }, [badgeCredential, currentLocation?.name, user?.fullName, user?.role]);

  const openPinSetup = React.useCallback(() => {
    setPinDraft('');
    setPinConfirm('');
    setPinError('');
    setPinModalVisible(true);
  }, []);

  const closePinSetup = React.useCallback(() => {
    if (pinSaving) return;
    setPinModalVisible(false);
    setPinDraft('');
    setPinConfirm('');
    setPinError('');
  }, [pinSaving]);

  const saveAuthorizationPin = React.useCallback(async () => {
    if (!/^\d{4}$/.test(pinDraft)) {
      setPinError('PIN must be exactly 4 digits.');
      return;
    }
    if (pinDraft !== pinConfirm) {
      setPinError('PIN entries do not match.');
      return;
    }

    setPinSaving(true);
    setPinError('');
    try {
      await apiFetch('/auth/authorization-pin', {
        method: 'POST',
        body: JSON.stringify({ pin: pinDraft }),
      });
      setPinModalVisible(false);
      setPinDraft('');
      setPinConfirm('');
      Alert.alert('Authorization PIN Saved', 'Manager PIN, barcode, and card approval can now use this 4-digit secret.');
    } catch (err: any) {
      setPinError(formatPosError(err, 'Unable to save authorization PIN.'));
    } finally {
      setPinSaving(false);
    }
  }, [pinConfirm, pinDraft]);

  const requireBadgePin = React.useCallback(() => {
    if (!isManagerAuthorizationPin(pinDraft)) {
      setPinError('PIN must be exactly 4 digits.');
      return false;
    }
    if (pinDraft !== pinConfirm) {
      setPinError('PIN entries do not match.');
      return false;
    }
    return true;
  }, [pinConfirm, pinDraft]);

  const openBadgePreview = React.useCallback(() => {
    if (!requireBadgePin()) return;
    setBadgePreviewVisible(true);
  }, [requireBadgePin]);

  const printAuthorizationBadge = React.useCallback(async () => {
    if (!requireBadgePin() || !badgeZpl) return;
    setBadgePrinting(true);
    try {
      const result = await printZplSafely(printer, badgeZpl, {
        type: 'barcode-label',
        title: 'Manager Badge Test Label',
        sourceId: 'settings-badge-test',
      });
      if (!result.success) {
        Alert.alert('Badge Printer Not Ready', result.error || 'Unable to print the manager badge.', [
          { text: 'Preview Badge', onPress: () => setBadgePreviewVisible(true) },
          { text: 'OK', style: 'cancel' },
        ]);
        return;
      }
      Alert.alert('Badge Printed', 'Manager authorization badge sent to the label printer.');
    } finally {
      setBadgePrinting(false);
    }
  }, [badgeZpl, printer, requireBadgePin]);

  const handleAuthorizationTestApproved = React.useCallback((
    approverName: string,
    approval?: ManagerAuthorization,
  ) => {
    const method = approval?.method ?? 'pin';
    setAuthorizationTestVisible(false);
    setLastAuthorizationTest({ approverName, method });
    Alert.alert(
      'Authorization Test Passed',
      `${approverName} approved with ${fmtAuthorizationMethod(method)}.`,
    );
  }, []);

  return (
    <SafeAreaView
      style={styles.container}
      testID="settings-screen"
      accessibilityLabel="Settings screen"
    >
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
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Device lock</Text>
            <Text style={styles.rowValue}>{deviceBinding ? 'Locked to this store' : 'Registration required'}</Text>
          </View>
          {deviceBinding ? (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Registered by</Text>
              <Text style={styles.rowValue}>{deviceBinding.boundBy}</Text>
            </View>
          ) : null}
        </Card>

        {/* Authorization */}
        {canManageAuthorization && (
          <Card style={styles.card}>
            <Text style={styles.sectionLabel}>AUTHORIZATION</Text>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Approvals</Text>
              <Text style={styles.rowValue}>PIN / Barcode / Card</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Badge and card secret</Text>
              <Text style={styles.rowValue}>Same 4-digit PIN</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Credential test</Text>
              <Text style={styles.rowValue}>
                {lastAuthorizationTest
                  ? `${fmtAuthorizationMethod(lastAuthorizationTest.method)} approved`
                  : 'Not run'}
              </Text>
            </View>
            <View style={styles.authorizationActions}>
              <View style={styles.authorizationAction}>
                <Icon name="barcode" size={18} color={colors.accent.primary} />
                <Text style={styles.authorizationActionText}>Manager badge barcode</Text>
              </View>
              <View style={styles.authorizationAction}>
                <Icon name="card" size={18} color={colors.accent.primary} />
                <Text style={styles.authorizationActionText}>Card swipe track</Text>
              </View>
            </View>
            <Pressable
              style={styles.navRow}
              onPress={openPinSetup}
              android_ripple={{ color: colors.accent.glow }}
            >
              <Text style={styles.navRowText}>Set Manager Authorization PIN</Text>
              <Text style={styles.navArrow}>{'\u2192'}</Text>
            </Pressable>
            <Pressable
              style={styles.navRow}
              onPress={() => setAuthorizationTestVisible(true)}
              android_ripple={{ color: colors.accent.glow }}
            >
              <Text style={styles.navRowText}>Test PIN / Barcode / Card</Text>
              <Text style={styles.navArrow}>{'\u2192'}</Text>
            </Pressable>
          </Card>
        )}

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
                disabled={reconciling}
                loading={reconciling}
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
            <Text style={styles.rowLabel}>Appearance</Text>
            <Text style={styles.rowValue}>Light mode</Text>
          </View>
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

      <Modal
        visible={pinModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closePinSetup}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.pinModal}>
            <Text style={styles.pinModalTitle}>Manager Authorization PIN</Text>
            <Text style={styles.pinModalBody}>
              This 4-digit secret authorizes protected actions from keypad entry, manager barcode, or manager card swipe.
            </Text>
            <TextInput
              value={pinDraft}
              onChangeText={(value) => {
                setPinError('');
                setPinDraft(normalizeManagerAuthorizationPin(value));
              }}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
              placeholder="New PIN"
              placeholderTextColor={colors.text.muted}
              style={styles.pinInput}
            />
            <TextInput
              value={pinConfirm}
              onChangeText={(value) => {
                setPinError('');
                setPinConfirm(normalizeManagerAuthorizationPin(value));
              }}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
              placeholder="Confirm PIN"
              placeholderTextColor={colors.text.muted}
              style={styles.pinInput}
            />
            {pinError ? <Text style={styles.pinError}>{pinError}</Text> : null}
            {pinReady ? (
              <View style={styles.credentialPreview}>
                <View style={styles.credentialPreviewRow}>
                  <Text style={styles.credentialPreviewLabel}>Barcode</Text>
                  <Text style={styles.credentialPreviewValue}>{maskManagerCredential(badgeCredential)}</Text>
                </View>
                <View style={styles.credentialPreviewRow}>
                  <Text style={styles.credentialPreviewLabel}>Card</Text>
                  <Text style={styles.credentialPreviewValue}>{maskManagerCredential(cardCredential)}</Text>
                </View>
              </View>
            ) : null}
            <View style={styles.modalActions}>
              <Button
                title="Cancel"
                variant="secondary"
                onPress={closePinSetup}
                disabled={pinSaving}
                style={styles.modalButton}
              />
              <Button
                title="Preview"
                variant="secondary"
                onPress={openBadgePreview}
                disabled={pinSaving}
                style={styles.modalButton}
              />
              <Button
                title="Save PIN"
                onPress={saveAuthorizationPin}
                loading={pinSaving}
                disabled={pinSaving}
                style={styles.modalButton}
              />
            </View>
          </View>
        </View>
      </Modal>
      <LabelPreviewModal
        visible={badgePreviewVisible}
        itemName={MANAGER_BADGE_TITLE}
        sku={user?.fullName || user?.role || 'Manager'}
        barcode={badgeCredential}
        zpl={badgeZpl}
        onClose={() => setBadgePreviewVisible(false)}
        onPrint={printAuthorizationBadge}
        printing={badgePrinting}
        statusLabel="Manager approval badge"
      />
      <ManagerPinModal
        visible={authorizationTestVisible}
        action="Test manager authorization credential"
        requiredLevel={2}
        onApprove={handleAuthorizationTestApproved}
        onCancel={() => setAuthorizationTestVisible(false)}
      />
    </SafeAreaView>
  );
}

const createStyles = () => StyleSheet.create({
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
    ...textStyles.label,
    color: colors.accent.primary,
    textTransform: 'uppercase',
    letterSpacing: 0,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 56,
    paddingVertical: spacing.sm,
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
    minHeight: 56,
    paddingVertical: spacing.sm,
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
  authorizationActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  authorizationAction: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.accent.muted,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  authorizationActionText: {
    ...textStyles.caption,
    color: colors.text.primary,
    flex: 1,
  },
  signOutContainer: {
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.46)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  pinModal: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 8,
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    padding: spacing.xl,
  },
  pinModalTitle: {
    ...textStyles.heading,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  pinModalBody: {
    ...textStyles.body,
    color: colors.text.secondary,
    marginBottom: spacing.lg,
  },
  pinInput: {
    minHeight: 54,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.bg.elevated,
    color: colors.text.primary,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    ...textStyles.heading,
  },
  pinError: {
    ...textStyles.caption,
    color: colors.status.danger,
    marginBottom: spacing.md,
  },
  credentialPreview: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.bg.primary,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  credentialPreviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  credentialPreviewLabel: {
    ...textStyles.caption,
    color: colors.text.secondary,
  },
  credentialPreviewValue: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: colors.text.primary,
    flexShrink: 1,
    textAlign: 'right',
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  modalButton: {
    flex: 1,
    minWidth: 110,
  },
});
