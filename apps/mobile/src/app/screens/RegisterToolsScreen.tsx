import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '@/hooks/use-auth';
import { usePosPermission } from '@/hooks/use-pos-permission';
import { useActiveShiftQuery } from '@/hooks/use-shift';
import { usePrinter } from '@/hardware/printer/context';
import { getLockedLocationId } from '@/config/device-binding';
import { ManagerPinModal, type ManagerAuthorization } from '@/components/ManagerPinModal';
import { Button, Card, Icon, Input } from '@/components/ui';
import { apiFetch } from '@/services/api-client';
import { queryClient } from '@/services/query-client';
import { colors, fonts, fontSize, radius, spacing, textStyles } from '@/theme';
import { formatPosError } from '@/utils/pos-error-messages';
import {
  addRegisterDrawerEvent,
  getRecentRegisterDrawerEvents,
  updateRegisterDrawerEvent,
  type RegisterDrawerAction,
  type RegisterDrawerEvent,
} from '@/storage/register-drawer-events';

interface DrawerActionOption {
  type: RegisterDrawerAction;
  title: string;
  subtitle: string;
  amountRequired: boolean;
  tone: 'primary' | 'success' | 'danger';
}

const DRAWER_ACTIONS: DrawerActionOption[] = [
  {
    type: 'NO_SALE',
    title: 'No Sale',
    subtitle: 'Drawer open',
    amountRequired: false,
    tone: 'primary',
  },
  {
    type: 'PAID_IN',
    title: 'Paid In',
    subtitle: 'Cash added',
    amountRequired: true,
    tone: 'success',
  },
  {
    type: 'PAID_OUT',
    title: 'Paid Out',
    subtitle: 'Cash removed',
    amountRequired: true,
    tone: 'danger',
  },
];

function fmtPHP(amount: number): string {
  return `\u20B1${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function parseMoney(value: string): number {
  const normalized = value.replace(/[^\d.]/g, '');
  const firstDot = normalized.indexOf('.');
  const compact = firstDot >= 0
    ? normalized.slice(0, firstDot + 1) + normalized.slice(firstDot + 1).replace(/\./g, '')
    : normalized;
  const parsed = Number(compact);
  return Number.isFinite(parsed) ? parsed : 0;
}

function actionLabel(type: RegisterDrawerAction): string {
  return DRAWER_ACTIONS.find(action => action.type === type)?.title ?? type;
}

function fmtTime(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function eventStatusLabel(event: RegisterDrawerEvent): string {
  if (event.syncStatus === 'synced') return event.drawerOpened ? 'Saved / Opened' : 'Saved';
  if (event.syncStatus === 'failed') return 'Local only';
  return event.drawerOpened ? 'Pending / Opened' : 'Pending';
}

function toneColor(tone: DrawerActionOption['tone']): string {
  if (tone === 'success') return colors.status.success;
  if (tone === 'danger') return colors.status.danger;
  return colors.accent.primary;
}

export default function RegisterToolsScreen() {
  const navigation = useNavigation<any>();
  const { user, locations, locationId, deviceBinding } = useAuth();
  const { requiredLevel } = usePosPermission();
  const activeShiftQuery = useActiveShiftQuery();
  const activeShift = activeShiftQuery.data;
  const printer = usePrinter();
  const lockedLocationId = getLockedLocationId();
  const styles = createStyles();

  const [selectedType, setSelectedType] = useState<RegisterDrawerAction>('NO_SALE');
  const [amountInput, setAmountInput] = useState('');
  const [reason, setReason] = useState('');
  const [authorizationVisible, setAuthorizationVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [recentEvents, setRecentEvents] = useState<RegisterDrawerEvent[]>(() => getRecentRegisterDrawerEvents(8));

  const selectedAction = useMemo(
    () => DRAWER_ACTIONS.find(action => action.type === selectedType) ?? DRAWER_ACTIONS[0],
    [selectedType],
  );
  const parsedAmount = useMemo(() => parseMoney(amountInput), [amountInput]);
  const location = locations.find(item => item.id === locationId || item.id === lockedLocationId);
  const locationName = deviceBinding?.locationName
    ?? activeShift?.locationName
    ?? location?.name
    ?? 'Locked store';
  const cashierName = user?.fullName ?? activeShift?.cashierName ?? 'Cashier';

  const blocker = useMemo(() => {
    if (!lockedLocationId) return 'Device is not locked to a store.';
    if (activeShiftQuery.isLoading) return 'Checking active shift.';
    if (!activeShift) return 'Open shift required.';
    if (selectedAction.amountRequired && parsedAmount <= 0) return 'Enter a cash amount.';
    if (selectedAction.amountRequired && reason.trim().length < 3) return 'Enter a reason.';
    return '';
  }, [activeShift, activeShiftQuery.isLoading, lockedLocationId, parsedAmount, reason, selectedAction.amountRequired]);

  const handleAmountChange = useCallback((value: string) => {
    const sanitized = value.replace(/[^\d.]/g, '');
    const firstDot = sanitized.indexOf('.');
    const compact = firstDot >= 0
      ? sanitized.slice(0, firstDot + 1) + sanitized.slice(firstDot + 1).replace(/\./g, '')
      : sanitized;
    setAmountInput(compact);
  }, []);

  const requestAuthorization = useCallback(() => {
    if (blocker) {
      Alert.alert('Register Not Ready', blocker);
      return;
    }
    setAuthorizationVisible(true);
  }, [blocker]);

  const handleApproval = useCallback(async (
    approverName: string,
    approval?: ManagerAuthorization,
  ) => {
    if (!approval?.credential || !activeShift || !lockedLocationId || !user) {
      Alert.alert('Authorization Required', 'Manager approval was not captured.');
      return;
    }

    setAuthorizationVisible(false);
    setSubmitting(true);
    let drawerOpened = false;
    let drawerError: string | undefined;

    try {
      try {
        await printer.openCashDrawer();
        drawerOpened = true;
      } catch (err: any) {
        drawerError = err?.message || 'Cash drawer did not open.';
      }

      const localEvent = addRegisterDrawerEvent({
        type: selectedAction.type,
        amount: selectedAction.amountRequired ? parsedAmount : 0,
        reason: reason.trim(),
        locationId: lockedLocationId,
        locationName,
        shiftId: activeShift.id,
        cashierId: user.id,
        cashierName,
        approvedBy: approverName,
        authorizationMethod: approval.method,
        authorizationUserId: approval.userId,
        drawerOpened,
        drawerError,
      });

      let serverSaved = false;
      let syncError: string | undefined;
      try {
        const response = await apiFetch<{ data: { id: string } }>(
          `/shifts/${activeShift.id}/drawer-events`,
          {
            method: 'POST',
            requireLockedLocation: true,
            body: JSON.stringify({
              type: selectedAction.type,
              amount: selectedAction.amountRequired ? parsedAmount.toFixed(2) : '0.00',
              reason: reason.trim(),
              clientEventId: localEvent.id,
              authorizationCredential: approval.credential,
              authorizationMethod: approval.method,
              drawerOpened,
              drawerError,
            }),
          },
        );
        updateRegisterDrawerEvent(localEvent.id, {
          serverId: response.data.id,
          syncStatus: 'synced',
          syncError: undefined,
        });
        serverSaved = true;
        queryClient.invalidateQueries({ queryKey: ['shifts'] });
        queryClient.invalidateQueries({ queryKey: ['shifts', 'z-reading', activeShift.id] });
      } catch (err: any) {
        syncError = formatPosError(err, 'Saved locally, but the server did not record this drawer event.');
        updateRegisterDrawerEvent(localEvent.id, {
          syncStatus: 'failed',
          syncError,
        });
      }

      setRecentEvents(getRecentRegisterDrawerEvents(8));
      setAmountInput('');
      setReason('');

      Alert.alert(
        serverSaved ? 'Drawer Saved' : 'Drawer Saved Locally',
        [
          drawerOpened
            ? `${selectedAction.title} recorded and drawer opened.`
            : `${selectedAction.title} recorded. ${drawerError}`,
          serverSaved ? 'Server audit updated.' : syncError,
        ].filter(Boolean).join('\n\n'),
      );
    } finally {
      setSubmitting(false);
    }
  }, [
    activeShift,
    cashierName,
    lockedLocationId,
    locationName,
    parsedAmount,
    printer,
    reason,
    selectedAction,
    user,
  ]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()} hitSlop={10}>
          <Icon name="chevron-left" size={24} color={colors.text.secondary} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Register Tools</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Card style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <View>
              <Text style={styles.cardTitle}>Register Status</Text>
              <Text style={styles.cardSubtitle}>{locationName}</Text>
            </View>
            <View style={[styles.statusPill, blocker ? styles.statusPillWarning : styles.statusPillReady]}>
              <Text style={[styles.statusPillText, blocker ? styles.statusPillTextWarning : styles.statusPillTextReady]}>
                {blocker ? 'Review' : 'Ready'}
              </Text>
            </View>
          </View>

          <View style={styles.statusGrid}>
            <StatusTile label="Store Lock" value={lockedLocationId ? 'Locked' : 'Missing'} tone={lockedLocationId ? 'success' : 'danger'} />
            <StatusTile label="Shift" value={activeShift ? 'Open' : activeShiftQuery.isLoading ? 'Checking' : 'Missing'} tone={activeShift ? 'success' : 'danger'} />
            <StatusTile label="Cashier" value={cashierName} />
          </View>

          {blocker ? <Text style={styles.blockerText}>{blocker}</Text> : null}
        </Card>

        <Card style={styles.actionCard}>
          <Text style={styles.cardTitle}>Drawer Action</Text>
          <View style={styles.actionGrid}>
            {DRAWER_ACTIONS.map(action => {
              const selected = action.type === selectedType;
              const color = toneColor(action.tone);
              return (
                <Pressable
                  key={action.type}
                  style={[
                    styles.actionOption,
                    selected && { borderColor: color, backgroundColor: `${color}12` },
                  ]}
                  onPress={() => setSelectedType(action.type)}
                >
                  <Text style={[styles.actionTitle, selected && { color }]}>{action.title}</Text>
                  <Text style={styles.actionSubtitle}>{action.subtitle}</Text>
                </Pressable>
              );
            })}
          </View>

          {selectedAction.amountRequired ? (
            <>
              <Text style={styles.inputLabel}>Amount</Text>
              <Input
                value={amountInput}
                onChangeText={handleAmountChange}
                placeholder="0.00"
                keyboardType="decimal-pad"
                leftIcon={<Text style={styles.pesoPrefix}>{'\u20B1'}</Text>}
                style={styles.input}
              />
            </>
          ) : null}

          <Text style={styles.inputLabel}>{selectedAction.amountRequired ? 'Reason' : 'Reason (optional)'}</Text>
          <Input
            value={reason}
            onChangeText={setReason}
            placeholder={selectedAction.amountRequired ? 'Enter reason' : 'Optional note'}
            multiline
            style={styles.reasonInput}
          />

          <View style={styles.submitRow}>
            <View style={styles.submitSummary}>
              <Text style={styles.summaryLabel}>Amount</Text>
              <Text style={styles.summaryValue}>{fmtPHP(selectedAction.amountRequired ? parsedAmount : 0)}</Text>
            </View>
            <Button
              title="Request Approval"
              onPress={requestAuthorization}
              loading={submitting}
              disabled={!!blocker || submitting}
              style={styles.submitButton}
              icon={<Icon name="cash" size={18} color={colors.text.inverse} />}
            />
          </View>
        </Card>

        <Card style={styles.historyCard}>
          <View style={styles.historyHeader}>
            <Text style={styles.cardTitle}>Recent Drawer Events</Text>
            <Text style={styles.historyCount}>{recentEvents.length}</Text>
          </View>
          {recentEvents.length === 0 ? (
            <Text style={styles.emptyText}>No drawer events recorded on this register.</Text>
          ) : (
            <View style={styles.eventList}>
              {recentEvents.map(event => (
                <View key={event.id} style={styles.eventRow}>
                  <View style={styles.eventMain}>
                    <Text style={styles.eventTitle}>{actionLabel(event.type)}</Text>
                    <Text style={styles.eventMeta}>
                      {fmtTime(event.createdAt)} / {event.approvedBy} / {event.authorizationMethod}
                    </Text>
                    {event.reason ? <Text style={styles.eventReason} numberOfLines={1}>{event.reason}</Text> : null}
                  </View>
                  <View style={styles.eventAmountBlock}>
                    <Text style={[
                      styles.eventAmount,
                      event.type === 'PAID_IN' && styles.eventAmountIn,
                      event.type === 'PAID_OUT' && styles.eventAmountOut,
                    ]}>
                      {event.type === 'NO_SALE' ? 'Open' : fmtPHP(event.amount)}
                    </Text>
                    <Text style={[
                      styles.eventStatus,
                      event.syncStatus !== 'synced' && styles.eventStatusWarning,
                    ]}>
                      {eventStatusLabel(event)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </Card>
      </ScrollView>

      <ManagerPinModal
        visible={authorizationVisible}
        action={`${selectedAction.title}${selectedAction.amountRequired ? ` ${fmtPHP(parsedAmount)}` : ''}`}
        requiredLevel={requiredLevel('cashDrawerException')}
        onApprove={handleApproval}
        onCancel={() => setAuthorizationVisible(false)}
      />
    </SafeAreaView>
  );
}

function StatusTile({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'danger';
}) {
  const styles = createStyles();
  return (
    <View style={styles.statusTile}>
      <Text style={styles.statusTileLabel}>{label}</Text>
      <Text
        style={[
          styles.statusTileValue,
          tone === 'success' && styles.statusTileSuccess,
          tone === 'danger' && styles.statusTileDanger,
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  header: {
    minHeight: 72,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    backgroundColor: colors.bg.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 120,
  },
  backText: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    marginLeft: spacing.xs,
  },
  headerTitle: {
    ...textStyles.heading,
    color: colors.text.primary,
  },
  headerSpacer: {
    minWidth: 120,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 96,
    gap: spacing.lg,
  },
  statusCard: {
    gap: spacing.md,
  },
  actionCard: {
    gap: spacing.md,
  },
  historyCard: {
    gap: spacing.md,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  cardTitle: {
    fontFamily: fonts.display.bold,
    fontSize: fontSize.lg,
    color: colors.text.primary,
  },
  cardSubtitle: {
    ...textStyles.caption,
    color: colors.text.secondary,
    marginTop: 2,
  },
  statusPill: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  statusPillReady: {
    backgroundColor: colors.status.successBg,
  },
  statusPillWarning: {
    backgroundColor: colors.status.warningBg,
  },
  statusPillText: {
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.xs,
  },
  statusPillTextReady: {
    color: colors.status.successText,
  },
  statusPillTextWarning: {
    color: colors.status.warningText,
  },
  statusGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statusTile: {
    flex: 1,
    minHeight: 66,
    borderRadius: radius.sm,
    backgroundColor: colors.bg.elevated,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    justifyContent: 'center',
  },
  statusTileLabel: {
    fontFamily: fonts.body.medium,
    fontSize: fontSize.xs,
    color: colors.text.muted,
  },
  statusTileValue: {
    fontFamily: fonts.display.bold,
    fontSize: fontSize.base,
    color: colors.text.primary,
    marginTop: 2,
  },
  statusTileSuccess: {
    color: colors.status.successText,
  },
  statusTileDanger: {
    color: colors.status.dangerText,
  },
  blockerText: {
    ...textStyles.caption,
    color: colors.status.warningText,
  },
  actionGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionOption: {
    flex: 1,
    minHeight: 72,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.bg.surface,
    padding: spacing.md,
    justifyContent: 'center',
  },
  actionTitle: {
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  actionSubtitle: {
    fontFamily: fonts.body.regular,
    fontSize: fontSize.xs,
    color: colors.text.secondary,
    marginTop: 3,
  },
  inputLabel: {
    fontFamily: fonts.body.medium,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  input: {
    marginTop: -spacing.xs,
  },
  reasonInput: {
    marginTop: -spacing.xs,
  },
  pesoPrefix: {
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.base,
    color: colors.text.secondary,
  },
  submitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  submitSummary: {
    flex: 1,
    minHeight: 52,
    borderRadius: radius.sm,
    backgroundColor: colors.bg.elevated,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  summaryLabel: {
    fontFamily: fonts.body.medium,
    fontSize: fontSize.xs,
    color: colors.text.muted,
  },
  summaryValue: {
    fontFamily: fonts.display.bold,
    fontSize: fontSize.lg,
    color: colors.text.primary,
  },
  submitButton: {
    minWidth: 220,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  historyCount: {
    fontFamily: fonts.display.bold,
    fontSize: fontSize.base,
    color: colors.text.secondary,
  },
  emptyText: {
    ...textStyles.body,
    color: colors.text.secondary,
  },
  eventList: {
    gap: spacing.sm,
  },
  eventRow: {
    minHeight: 72,
    borderRadius: radius.sm,
    backgroundColor: colors.bg.elevated,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  eventMain: {
    flex: 1,
    minWidth: 0,
  },
  eventTitle: {
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  eventMeta: {
    fontFamily: fonts.body.medium,
    fontSize: fontSize.xs,
    color: colors.text.muted,
    marginTop: 2,
  },
  eventReason: {
    fontFamily: fonts.body.regular,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    marginTop: 2,
  },
  eventAmountBlock: {
    alignItems: 'flex-end',
    minWidth: 112,
  },
  eventAmount: {
    fontFamily: fonts.display.bold,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  eventAmountIn: {
    color: colors.status.successText,
  },
  eventAmountOut: {
    color: colors.status.dangerText,
  },
  eventStatus: {
    fontFamily: fonts.body.medium,
    fontSize: fontSize.xs,
    color: colors.status.successText,
    marginTop: 2,
  },
  eventStatusWarning: {
    color: colors.status.warningText,
  },
});
