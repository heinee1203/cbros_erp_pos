import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { usePrinter } from '@/hardware/printer/context';
import type { PrinterDevice } from '@/hardware/printer/types';
import { storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';
import { useLayout } from '@/hooks/use-layout';
import { colors, textStyles, spacing, radius, layout } from '@/theme';
import { Button, Card, Chip } from '@/components/ui';
import { LabelPreviewModal } from '@/components/LabelPreviewModal';
import { buildShelfLabel } from '@/hardware/printer/zpl-label-builder';
import {
  getPrinterLanguage,
  getPrinterLanguageLabel,
  printReceiptSafely,
  printZplSafely,
  setPrinterLanguage,
  type PrinterLanguage,
} from '@/hardware/printer/settings';

export default function PrinterSetupScreen() {
  const navigation = useNavigation();
  const { isTablet, screenPadding } = useLayout();
  const printer = usePrinter();
  const [scanning, setScanning] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [devices, setDevices] = useState<PrinterDevice[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [connectionRevision, setConnectionRevision] = useState(0);
  const [testPrinting, setTestPrinting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [lastDeviceId, setLastDeviceId] = useState<string | null>(() => storage.getString(KEYS.PRINTER_DEVICE_ID) ?? null);
  const [labelPreviewVisible, setLabelPreviewVisible] = useState(false);
  const [paperWidth, setPaperWidthState] = useState(storage.getString(KEYS.PRINTER_PAPER_WIDTH) || '80mm');
  const [printerLanguage, setPrinterLanguageState] = useState<PrinterLanguage>(() => getPrinterLanguage());

  const styles = createStyles();
  const isConnected = connectionRevision >= 0 && printer.isConnected;
  const testLabelZpl = buildShelfLabel({
    itemName: 'APEX POS TEST LABEL',
    sku: 'TEST-001',
    barcode: '4806512345678',
    price: 100,
  });

  const handleDiscover = useCallback(async () => {
    setScanning(true);
    setHasScanned(false);
    setScanError(null);
    try {
      const found = await printer.discover();
      setDevices(found);
      setHasScanned(true);
    } catch (err: any) {
      const message = err.message || 'Could not scan for printers';
      setDevices([]);
      setHasScanned(true);
      setScanError(message);
      Alert.alert('Scan Failed', message);
    } finally {
      setScanning(false);
    }
  }, [printer]);

  const handleConnect = useCallback(async (device: PrinterDevice) => {
    setConnecting(device.id);
    try {
      await printer.connect(device.id);
      setConnectionRevision(v => v + 1);
      setLastDeviceId(device.id);
      Alert.alert('Connected', `Connected to ${device.name}`);
    } catch (err: any) {
      Alert.alert('Connection Failed', err.message || 'Could not connect');
    } finally {
      setConnecting(null);
    }
  }, [printer]);

  const handleTestPrint = useCallback(async () => {
    setTestPrinting(true);
    try {
      const result = printerLanguage === 'zpl'
        ? await printZplSafely(printer, testLabelZpl)
        : await printReceiptSafely(printer, {
          header: { storeName: 'CBROS GENUINE AUTOPARTS', address: 'Printer Test' },
          transaction: {
            receiptNumber: 'TEST-001',
            date: new Date().toLocaleString(),
            cashier: 'System',
            lines: [{ name: 'Printer Test Item', qty: 1, unitPrice: 100, total: 100 }],
            subtotal: 100,
            discount: 0,
            grandTotal: 100,
            paymentMethod: 'CASH',
          },
          footer: { message: 'Printer test successful' },
        });

      if (!result.success) {
        Alert.alert(
          'Test Failed',
          result.error || 'Print test failed',
          printerLanguage === 'zpl'
            ? [
                { text: 'Preview Label', onPress: () => setLabelPreviewVisible(true) },
                { text: 'OK', style: 'cancel' },
              ]
            : undefined,
        );
      } else {
        Alert.alert('Success', 'Test page printed successfully');
      }
    } catch (err: any) {
      Alert.alert('Test Failed', err.message || 'Print test failed');
    } finally {
      setTestPrinting(false);
    }
  }, [printer, printerLanguage, testLabelZpl]);

  const handleDisconnect = useCallback(async () => {
    setDisconnecting(true);
    try {
      await printer.disconnect();
      setConnectionRevision(v => v + 1);
      setLastDeviceId(null);
      Alert.alert('Disconnected', 'Printer disconnected');
    } catch (err: any) {
      Alert.alert('Disconnect Failed', err.message || 'Could not disconnect printer');
    } finally {
      setDisconnecting(false);
    }
  }, [printer]);

  const handleReconnect = useCallback(async () => {
    if (!lastDeviceId) return;
    setConnecting(lastDeviceId);
    try {
      await printer.connect(lastDeviceId);
      setConnectionRevision(v => v + 1);
      Alert.alert('Connected', 'Reconnected to the saved printer.');
    } catch (err: any) {
      Alert.alert('Reconnect Failed', err.message || 'Could not reconnect to the saved printer.');
    } finally {
      setConnecting(null);
    }
  }, [lastDeviceId, printer]);

  const handleForgetPrinter = useCallback(async () => {
    try {
      if (printer.isConnected) {
        await printer.disconnect();
      }
    } catch {
      // Clearing the saved printer still helps recover from stale Bluetooth IDs.
    }
    storage.delete(KEYS.PRINTER_DEVICE_ID);
    setLastDeviceId(null);
    setConnectionRevision(v => v + 1);
  }, [printer]);

  const setPaperWidth = useCallback((width: string) => {
    storage.set(KEYS.PRINTER_PAPER_WIDTH, width);
    setPaperWidthState(width);
  }, []);

  const handlePrinterLanguage = useCallback((language: PrinterLanguage) => {
    setPrinterLanguage(language);
    setPrinterLanguageState(language);
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} android_ripple={{ color: colors.accent.glow }} hitSlop={8}>
          <Text style={styles.backTextVisible}>Back</Text>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Printer Setup</Text>
        <View style={{ width: 60 }} />
      </View>

      <FlatList
        data={devices}
        keyExtractor={d => d.id}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingHorizontal: screenPadding },
          isTablet && styles.tabletContent,
        ]}
        ListHeaderComponent={
          <>
            {/* Status */}
            <Card style={styles.card}>
              <Text style={styles.sectionLabel}>STATUS</Text>
              <View style={styles.statusRow}>
                <View
                  style={[
                    styles.statusDot,
                    {
                      backgroundColor: isConnected
                        ? colors.status.success
                        : colors.text.muted,
                    },
                  ]}
                />
                <Text style={styles.statusText}>
                  {isConnected ? 'Connected' : 'Not connected'}
                </Text>
              </View>
              <View style={styles.statusMeta}>
                <Text style={styles.statusMetaText}>Mode: {getPrinterLanguageLabel(printerLanguage)}</Text>
                <Text style={styles.statusMetaText}>Paper: {paperWidth}</Text>
                <Text style={styles.statusMetaText}>Saved: {lastDeviceId ? lastDeviceId : 'None'}</Text>
              </View>

              <View style={styles.connectedActions}>
                <View style={styles.actionButtonWrapper}>
                  <Button
                    title={testPrinting ? 'Printing...' : 'Test Print'}
                    onPress={handleTestPrint}
                    variant="secondary"
                    loading={testPrinting}
                    disabled={testPrinting || disconnecting}
                    fullWidth
                  />
                </View>
                {lastDeviceId && !isConnected ? (
                  <View style={styles.actionButtonWrapper}>
                    <Button
                      title={connecting === lastDeviceId ? 'Connecting...' : 'Reconnect'}
                      onPress={handleReconnect}
                      variant="secondary"
                      loading={connecting === lastDeviceId}
                      disabled={Boolean(connecting) || testPrinting}
                      fullWidth
                    />
                  </View>
                ) : null}
                {isConnected ? (
                  <View style={styles.actionButtonWrapper}>
                    <Button
                      title={disconnecting ? 'Disconnecting...' : 'Disconnect'}
                      onPress={handleDisconnect}
                      variant="danger"
                      loading={disconnecting}
                      disabled={disconnecting || testPrinting}
                      fullWidth
                    />
                  </View>
                ) : null}
              </View>
              {lastDeviceId ? (
                <Pressable onPress={handleForgetPrinter} hitSlop={8} style={styles.forgetPrinterButton}>
                  <Text style={styles.forgetPrinterText}>Forget saved printer</Text>
                </Pressable>
              ) : null}
            </Card>

            {/* Printer Type */}
            <Card style={styles.card}>
              <Text style={styles.sectionLabel}>PRINTER TYPE</Text>
              <View style={styles.chipRow}>
                <Chip
                  label="Receipt"
                  active={printerLanguage === 'escpos'}
                  onPress={() => handlePrinterLanguage('escpos')}
                  style={styles.chip}
                />
                <Chip
                  label="Label"
                  active={printerLanguage === 'zpl'}
                  onPress={() => handlePrinterLanguage('zpl')}
                  style={styles.chip}
                />
              </View>
              <Text style={styles.printerModeText}>{getPrinterLanguageLabel(printerLanguage)}</Text>
            </Card>

            {/* Paper Width */}
            <Card style={styles.card}>
              <Text style={styles.sectionLabel}>PAPER WIDTH</Text>
              <View style={styles.chipRow}>
                <Chip
                  label="80mm"
                  active={paperWidth === '80mm'}
                  onPress={() => setPaperWidth('80mm')}
                  style={styles.chip}
                />
                <Chip
                  label="58mm"
                  active={paperWidth === '58mm'}
                  onPress={() => setPaperWidth('58mm')}
                  style={styles.chip}
                />
              </View>
            </Card>

            {/* Discovery */}
            <Card style={styles.card}>
              <Text style={styles.sectionLabel}>AVAILABLE PRINTERS</Text>
              <Button
                title={scanning ? `Scanning... ${devices.length} device(s) found` : 'Scan for Printers'}
                onPress={handleDiscover}
                variant="secondary"
                disabled={scanning}
                loading={scanning}
                fullWidth
              />
              {hasScanned && devices.length === 0 && !scanning && (
                <Text style={[styles.emptyDeviceText, scanError && styles.scanErrorText]}>
                  {scanError || 'No printers found'}
                </Text>
              )}
            </Card>

            {devices.length > 0 && (
              <Text style={styles.devicesHeading}>Found Devices</Text>
            )}
          </>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.deviceRow}
            onPress={() => handleConnect(item)}
            disabled={connecting === item.id}
            android_ripple={{ color: colors.accent.glow }}
          >
            <View>
              <Text style={styles.deviceName}>{item.name}</Text>
              <Text style={styles.deviceAddress}>{item.address}</Text>
            </View>
            {connecting === item.id ? (
              <ActivityIndicator size="small" color={colors.accent.primary} />
            ) : (
              <Text style={styles.connectText}>Connect</Text>
            )}
          </Pressable>
        )}
      />
      <LabelPreviewModal
        visible={labelPreviewVisible}
        itemName="APEX POS TEST LABEL"
        sku="TEST-001"
        barcode="4806512345678"
        price={100}
        zpl={testLabelZpl}
        onClose={() => setLabelPreviewVisible(false)}
        onPrint={handleTestPrint}
        printing={testPrinting}
        statusLabel={printerLanguage === 'zpl' ? undefined : 'Switch printer type to Label before printing ZPL.'}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  backText: {
    display: 'none',
  },
  backTextVisible: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
  },
  headerTitle: {
    ...textStyles.subheading,
    color: colors.text.primary,
  },
  scrollContent: {
    paddingTop: spacing.lg,
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
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusText: {
    ...textStyles.body,
    color: colors.text.primary,
  },
  statusMeta: {
    marginTop: spacing.sm,
    gap: 2,
  },
  statusMetaText: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
  },
  connectedActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionButtonWrapper: {
    flex: 1,
  },
  forgetPrinterButton: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
  },
  forgetPrinterText: {
    ...textStyles.caption,
    color: colors.status.danger,
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  chip: {
    minWidth: 72,
  },
  printerModeText: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
    marginTop: spacing.sm,
  },
  devicesHeading: {
    ...textStyles.caption,
    color: colors.text.secondary,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  emptyDeviceText: {
    ...textStyles.caption,
    color: colors.text.muted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  scanErrorText: {
    color: colors.status.danger,
  },
  deviceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  deviceName: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
  },
  deviceAddress: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
    marginTop: 2,
  },
  connectText: {
    ...textStyles.bodyMedium,
    color: colors.accent.primary,
  },
});
