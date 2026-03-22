import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useZReadingQuery } from '@/hooks/use-shift';
import { apiFetch } from '@/services/api-client';
import { queryClient } from '@/services/query-client';
import { colors, textStyles, spacing, layout, fonts, radius } from '@/theme';
import { usePrinter } from '@/hardware/printer/context';
import { buildZReadingReceipt } from '@/hardware/printer/z-reading-receipt';
import { storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';

function fmtPHP(amount: string | number): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return `₱${num.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtTime(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatMethod(method: string): string {
  const map: Record<string, string> = {
    CASH: 'Cash',
    CREDIT_CARD: 'Credit Card',
    DEBIT_CARD: 'Debit Card',
    QRPH: 'QRPH',
    GCASH: 'GCash',
    MAYA: 'Maya',
    BANK_TRANSFER: 'Bank Transfer',
    ACCOUNT: 'Charge/Account',
    EFT: 'EFT',
    CARD: 'Card',
    OTHER: 'Other',
  };
  return map[method] || method;
}

export default function ZReadingScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { shiftId, mode } = route.params as { shiftId: string; mode: 'view' | 'close' };

  const { data: zReading, isLoading, refetch } = useZReadingQuery(shiftId);
  const printer = usePrinter();
  const [cashTendered, setCashTendered] = useState('');
  const [closing, setClosing] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [notes, setNotes] = useState('');

  const styles = createStyles();

  const parsedCash = parseFloat(cashTendered) || 0;
  const expectedCash = parseFloat(zReading?.cashReconciliation.expectedCash ?? '0');
  const variance = parsedCash - expectedCash;

  const getVarianceColor = () => {
    if (!cashTendered) return colors.text.muted;
    const absVar = Math.abs(variance);
    if (absVar < 1) return colors.status.success;
    if (absVar < 50) return colors.status.warning;
    return colors.status.danger;
  };

  const handleCloseShift = useCallback(async () => {
    if (!cashTendered) {
      Alert.alert('Required', 'Please enter the actual cash count.');
      return;
    }

    Alert.alert(
      'Close Shift',
      `Actual cash: ${fmtPHP(parsedCash)}\nExpected: ${fmtPHP(expectedCash)}\nVariance: ${fmtPHP(variance)}\n\nAre you sure you want to close this shift?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close Shift',
          style: 'destructive',
          onPress: async () => {
            setClosing(true);
            try {
              await apiFetch(`/shifts/${shiftId}/close`, {
                method: 'POST',
                body: JSON.stringify({
                  actualCash: parsedCash.toFixed(2),
                  notes: notes || undefined,
                }),
              });
              queryClient.invalidateQueries({ queryKey: ['shifts'] });
              queryClient.invalidateQueries({ queryKey: ['sales'] });
              Alert.alert('Shift Closed', 'Z-Reading saved successfully.', [
                { text: 'OK', onPress: () => navigation.goBack() },
              ]);
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to close shift');
            } finally {
              setClosing(false);
            }
          },
        },
      ],
    );
  }, [cashTendered, parsedCash, expectedCash, variance, shiftId, notes, navigation]);

  const handlePrint = useCallback(async () => {
    if (!zReading) return;
    if (!printer.isConnected) {
      Alert.alert('Printer', 'No printer connected. Go to Settings > Printer Setup to connect.');
      return;
    }
    setPrinting(true);
    try {
      const paperWidth = (storage.getString(KEYS.PRINTER_PAPER_WIDTH) || '80mm') as '58mm' | '80mm';
      const receiptData = buildZReadingReceipt(zReading, mode, paperWidth);
      const result = await printer.printRaw(receiptData);
      if (!result.success) {
        Alert.alert('Print Error', result.error || 'Failed to print');
      }
    } catch (err: any) {
      Alert.alert('Print Error', err.message || 'Unexpected error');
    } finally {
      setPrinting(false);
    }
  }, [zReading, printer, mode]);

  if (isLoading || !zReading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
        <Text style={styles.loadingText}>Loading Z-Reading...</Text>
      </View>
    );
  }

  const isCloseMode = mode === 'close';
  const title = isCloseMode ? 'Z-READING / CLOSE SHIFT' : 'X-READING / SHIFT SUMMARY';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <Text style={styles.backBtnText}>← Back</Text>
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>{title}</Text>
          <Text style={styles.headerSubtitle}>
            {zReading.locationName} · {zReading.cashierName}
          </Text>
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Shift Info */}
        <View style={styles.shiftMeta}>
          <Text style={styles.metaText}>
            Opened: {fmtDate(zReading.openedAt)} at {fmtTime(zReading.openedAt)}
          </Text>
          {zReading.closedAt && (
            <Text style={styles.metaText}>
              Closed: {fmtDate(zReading.closedAt)} at {fmtTime(zReading.closedAt)}
            </Text>
          )}
        </View>

        {/* 1. Sales Summary */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sales Summary</Text>
          <View style={styles.separator} />
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Gross Sales</Text>
            <Text style={styles.summaryValue}>{fmtPHP(zReading.salesSummary.grossSales)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Refunds</Text>
            <Text style={[styles.summaryValue, { color: colors.status.danger }]}>
              -{fmtPHP(zReading.salesSummary.refundsTotal)}
            </Text>
          </View>
          <View style={styles.separator} />
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, styles.bold]}>Net Sales</Text>
            <Text style={[styles.summaryValue, styles.bold]}>{fmtPHP(zReading.salesSummary.netSales)}</Text>
          </View>
          <View style={styles.separator} />
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Transactions</Text>
            <Text style={styles.summaryValue}>{zReading.salesSummary.transactionCount}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Avg Ticket</Text>
            <Text style={styles.summaryValue}>{fmtPHP(zReading.salesSummary.avgTicket)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Voids</Text>
            <Text style={[styles.summaryValue, zReading.salesSummary.voidCount > 0 && { color: colors.status.danger }]}>
              {zReading.salesSummary.voidCount}
            </Text>
          </View>
        </View>

        {/* 2. Payment Breakdown */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Payment Breakdown</Text>
          <View style={styles.separator} />
          {zReading.paymentBreakdown.length === 0 ? (
            <Text style={styles.emptyText}>No payments recorded</Text>
          ) : (
            zReading.paymentBreakdown.map((p, i) => (
              <View key={i} style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>{formatMethod(p.method)} ({p.count})</Text>
                <Text style={styles.summaryValue}>{fmtPHP(p.total)}</Text>
              </View>
            ))
          )}
        </View>

        {/* 3. Cash Reconciliation */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Cash Reconciliation</Text>
          <View style={styles.separator} />
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Opening Float</Text>
            <Text style={styles.summaryValue}>{fmtPHP(zReading.openingFloat)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, styles.bold]}>Expected Cash</Text>
            <Text style={[styles.summaryValue, styles.bold]}>{fmtPHP(expectedCash)}</Text>
          </View>

          {isCloseMode && (
            <>
              <View style={styles.separator} />
              <Text style={styles.inputLabel}>Actual Cash Count</Text>
              {/* Denomination buttons */}
              <View style={styles.denomRow}>
                <Pressable
                  style={[styles.denomChip, styles.denomExact]}
                  android_ripple={{ color: colors.accent.glow }}
                  onPress={() => setCashTendered(expectedCash.toFixed(2))}
                >
                  <Text style={styles.denomExactText}>Exact</Text>
                </Pressable>
                {[1000, 500, 200, 100, 50, 20].map(d => (
                  <Pressable
                    key={d}
                    style={styles.denomChip}
                    android_ripple={{ color: colors.accent.glow }}
                    onPress={() => setCashTendered(String(parsedCash + d))}
                  >
                    <Text style={styles.denomChipText}>+{d >= 1000 ? `${d / 1000}K` : d}</Text>
                  </Pressable>
                ))}
                <Pressable
                  style={[styles.denomChip, styles.denomClear]}
                  android_ripple={{ color: colors.status.danger + '40' }}
                  onPress={() => setCashTendered('')}
                >
                  <Text style={styles.denomClearText}>C</Text>
                </Pressable>
              </View>

              <View style={styles.cashDisplay}>
                <Text style={styles.cashDisplayLabel}>Cash Counted:</Text>
                <Text style={styles.cashDisplayValue}>
                  {cashTendered ? fmtPHP(parsedCash) : '₱0.00'}
                </Text>
              </View>

              {cashTendered !== '' && (
                <View style={[styles.varianceRow, { borderLeftColor: getVarianceColor() }]}>
                  <Text style={styles.varianceLabel}>Variance</Text>
                  <Text style={[styles.varianceValue, { color: getVarianceColor() }]}>
                    {variance >= 0 ? '+' : ''}{fmtPHP(variance)}
                  </Text>
                </View>
              )}
            </>
          )}
        </View>

        {/* 4. Top Items */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Top 5 Items</Text>
          <View style={styles.separator} />
          {zReading.topItems.length === 0 ? (
            <Text style={styles.emptyText}>No items sold</Text>
          ) : (
            zReading.topItems.map((item, i) => (
              <View key={i} style={styles.topItemRow}>
                <View style={styles.topItemLeft}>
                  <Text style={styles.topItemRank}>{i + 1}.</Text>
                  <View>
                    <Text style={styles.topItemName} numberOfLines={1}>{item.productName}</Text>
                    <Text style={styles.topItemSku}>{item.mnemonicSku || ''}</Text>
                  </View>
                </View>
                <View style={styles.topItemRight}>
                  <Text style={styles.topItemQty}>{item.unitsSold} sold</Text>
                  <Text style={styles.topItemRevenue}>{fmtPHP(item.totalRevenue)}</Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* 5. Accountability */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Accountability</Text>

          {/* Voids */}
          <View style={styles.separator} />
          <Text style={styles.subSectionTitle}>
            Voids ({zReading.accountability.voids.length})
          </Text>
          {zReading.accountability.voids.length === 0 ? (
            <Text style={styles.emptyText}>No voids</Text>
          ) : (
            zReading.accountability.voids.map((v, i) => (
              <View key={i} style={styles.accountRow}>
                <View>
                  <Text style={styles.accountSaleNo}>{v.saleNo}</Text>
                  <Text style={styles.accountMeta}>
                    {fmtTime(v.voidedAt)} {v.voidedBy && `by ${v.voidedBy}`}
                  </Text>
                </View>
                <Text style={[styles.accountAmount, { color: colors.status.danger }]}>
                  {fmtPHP(v.amount)}
                </Text>
              </View>
            ))
          )}

          {/* Refunds */}
          <View style={styles.separator} />
          <Text style={styles.subSectionTitle}>
            Refunds ({zReading.accountability.refunds.length})
          </Text>
          {zReading.accountability.refunds.length === 0 ? (
            <Text style={styles.emptyText}>No refunds</Text>
          ) : (
            zReading.accountability.refunds.map((r, i) => (
              <View key={i} style={styles.accountRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.accountSaleNo}>{r.saleNo}</Text>
                  <Text style={styles.accountMeta}>
                    {fmtTime(r.refundedAt)} {r.refundedBy && `by ${r.refundedBy}`}
                  </Text>
                  {r.reason && <Text style={styles.accountReason} numberOfLines={1}>{r.reason}</Text>}
                </View>
                <Text style={[styles.accountAmount, { color: colors.status.danger }]}>
                  {fmtPHP(r.amount)}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* Close shift notes */}
        {isCloseMode && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Notes (optional)</Text>
            <TextInput
              style={styles.notesInput}
              placeholder="End of day notes..."
              placeholderTextColor={colors.text.muted}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
            />
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom action bar */}
      <View style={styles.bottomBar}>
        {isCloseMode ? (
          <>
            <Pressable
              style={[styles.printBtn, printing && styles.btnDisabled]}
              android_ripple={{ color: colors.accent.glow }}
              onPress={handlePrint}
              disabled={printing}
            >
              {printing ? (
                <ActivityIndicator size="small" color={colors.accent.primary} />
              ) : (
                <Text style={styles.printBtnText}>Print Z-Reading</Text>
              )}
            </Pressable>
            <Pressable
              style={[styles.closeShiftBtn, closing && styles.btnDisabled]}
              android_ripple={{ color: colors.accent.glow }}
              onPress={handleCloseShift}
              disabled={closing}
            >
              {closing ? (
                <ActivityIndicator size="small" color={colors.shift.bannerBtnText} />
              ) : (
                <Text style={styles.closeShiftBtnText}>Close Shift</Text>
              )}
            </Pressable>
          </>
        ) : (
          <Pressable
            style={[styles.printBtn, { flex: 1 }, printing && styles.btnDisabled]}
            android_ripple={{ color: colors.accent.glow }}
            onPress={handlePrint}
            disabled={printing}
          >
            {printing ? (
              <ActivityIndicator size="small" color={colors.accent.primary} />
            ) : (
              <Text style={styles.printBtnText}>Print X-Reading</Text>
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bg.primary,
  },
  loadingText: {
    ...textStyles.body,
    color: colors.text.muted,
    marginTop: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.screenPadding,
    paddingTop: layout.headerPaddingTop,
    paddingBottom: spacing.md,
    backgroundColor: colors.bg.primary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
  },
  backBtn: {
    minWidth: 52,
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.bg.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  backBtnText: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    ...textStyles.subheading,
    color: colors.accent.primary,
    fontFamily: fonts.display.bold,
  },
  headerSubtitle: {
    ...textStyles.captionSmall,
    color: colors.text.secondary,
    marginTop: 2,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: layout.screenPadding,
    gap: spacing.md,
  },
  shiftMeta: {
    gap: 2,
  },
  metaText: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
    fontFamily: fonts.mono.regular,
  },
  card: {
    backgroundColor: colors.bg.surface,
    borderRadius: 8,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  cardTitle: {
    ...textStyles.subheading,
    color: colors.text.primary,
    fontFamily: fonts.display.bold,
    marginBottom: spacing.sm,
    fontSize: 14,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border.subtle,
    marginVertical: spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  summaryLabel: {
    ...textStyles.caption,
    color: colors.text.secondary,
  },
  summaryValue: {
    ...textStyles.monoMd,
    color: colors.text.primary,
    fontSize: 13,
  },
  bold: {
    fontFamily: fonts.display.bold,
  },
  emptyText: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
    fontStyle: 'italic',
    paddingVertical: spacing.xs,
  },
  // Denomination buttons
  inputLabel: {
    ...textStyles.caption,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  denomRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  denomChip: {
    width: '23%' as any,
    paddingVertical: spacing.sm,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.bg.elevated,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  denomChipText: {
    ...textStyles.caption,
    color: colors.text.primary,
    fontFamily: fonts.mono.medium,
  },
  denomExact: {
    borderColor: colors.accent.primary,
    backgroundColor: colors.accent.glow,
  },
  denomExactText: {
    ...textStyles.caption,
    color: colors.accent.primary,
    fontFamily: fonts.display.bold,
  },
  denomClear: {
    borderColor: colors.status.danger,
    backgroundColor: colors.status.dangerBg,
  },
  denomClearText: {
    ...textStyles.caption,
    color: colors.status.danger,
    fontFamily: fonts.display.bold,
  },
  cashDisplay: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bg.elevated,
    borderRadius: 6,
    marginBottom: spacing.xs,
  },
  cashDisplayLabel: {
    ...textStyles.caption,
    color: colors.text.secondary,
  },
  cashDisplayValue: {
    ...textStyles.monoMd,
    color: colors.text.primary,
    fontFamily: fonts.mono.medium,
    fontSize: 16,
  },
  varianceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderLeftWidth: 3,
    backgroundColor: colors.bg.elevated,
    borderRadius: 4,
  },
  varianceLabel: {
    ...textStyles.caption,
    color: colors.text.secondary,
    fontFamily: fonts.display.bold,
  },
  varianceValue: {
    ...textStyles.monoMd,
    fontFamily: fonts.mono.medium,
    fontSize: 16,
  },
  // Top items
  topItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  topItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
  },
  topItemRank: {
    ...textStyles.caption,
    color: colors.text.muted,
    width: 20,
  },
  topItemName: {
    ...textStyles.caption,
    color: colors.text.primary,
    maxWidth: 200,
  },
  topItemSku: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
    fontFamily: fonts.mono.regular,
  },
  topItemRight: {
    alignItems: 'flex-end',
  },
  topItemQty: {
    ...textStyles.captionSmall,
    color: colors.text.secondary,
  },
  topItemRevenue: {
    ...textStyles.monoMd,
    color: colors.text.primary,
    fontSize: 12,
  },
  // Accountability
  subSectionTitle: {
    ...textStyles.caption,
    color: colors.text.secondary,
    fontFamily: fonts.display.bold,
    marginBottom: spacing.xs,
  },
  accountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  accountSaleNo: {
    ...textStyles.monoMd,
    color: colors.text.primary,
    fontSize: 12,
  },
  accountMeta: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
  },
  accountReason: {
    ...textStyles.captionSmall,
    color: colors.text.secondary,
    fontStyle: 'italic',
  },
  accountAmount: {
    ...textStyles.monoMd,
    fontSize: 12,
  },
  // Notes
  notesInput: {
    ...textStyles.body,
    color: colors.text.primary,
    backgroundColor: colors.bg.input,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border.default,
    padding: spacing.sm,
    textAlignVertical: 'top',
    minHeight: 60,
    marginTop: spacing.xs,
  },
  // Bottom bar
  bottomBar: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.md,
    backgroundColor: colors.bg.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border.default,
  },
  printBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.accent.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  printBtnText: {
    ...textStyles.body,
    color: colors.accent.primary,
    fontFamily: fonts.display.bold,
  },
  closeShiftBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: 8,
    backgroundColor: colors.shift.bannerBtnBg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  closeShiftBtnText: {
    ...textStyles.body,
    color: colors.shift.bannerBtnText,
    fontFamily: fonts.display.bold,
  },
  btnDisabled: {
    opacity: 0.6,
  },
});
