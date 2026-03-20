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

export default function PrinterSetupScreen() {
  const navigation = useNavigation();
  const { isTablet, screenPadding } = useLayout();
  const printer = usePrinter();
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<PrinterDevice[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);

  const paperWidth = storage.getString(KEYS.PRINTER_PAPER_WIDTH) || '80mm';

  const styles = createStyles();

  const handleDiscover = useCallback(async () => {
    setScanning(true);
    try {
      const found = await printer.discover();
      setDevices(found);
    } catch (err: any) {
      Alert.alert('Scan Failed', err.message || 'Could not scan for printers');
    } finally {
      setScanning(false);
    }
  }, [printer]);

  const handleConnect = useCallback(async (device: PrinterDevice) => {
    setConnecting(device.id);
    try {
      await printer.connect(device.id);
      Alert.alert('Connected', `Connected to ${device.name}`);
    } catch (err: any) {
      Alert.alert('Connection Failed', err.message || 'Could not connect');
    } finally {
      setConnecting(null);
    }
  }, [printer]);

  const handleTestPrint = useCallback(async () => {
    const result = await printer.printTestPage();
    if (!result.success) {
      Alert.alert('Test Failed', result.error || 'Print test failed');
    } else {
      Alert.alert('Success', 'Test page printed successfully');
    }
  }, [printer]);

  const handleDisconnect = useCallback(async () => {
    await printer.disconnect();
    Alert.alert('Disconnected', 'Printer disconnected');
  }, [printer]);

  const setPaperWidth = useCallback((width: string) => {
    storage.set(KEYS.PRINTER_PAPER_WIDTH, width);
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} android_ripple={{ color: colors.accent.glow }} hitSlop={8}>
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
                      backgroundColor: printer.isConnected
                        ? colors.status.success
                        : colors.text.muted,
                    },
                  ]}
                />
                <Text style={styles.statusText}>
                  {printer.isConnected ? 'Connected' : 'Not connected'}
                </Text>
              </View>

              {printer.isConnected && (
                <View style={styles.connectedActions}>
                  <View style={styles.actionButtonWrapper}>
                    <Button
                      title="Test Print"
                      onPress={handleTestPrint}
                      variant="secondary"
                      fullWidth
                    />
                  </View>
                  <View style={styles.actionButtonWrapper}>
                    <Button
                      title="Disconnect"
                      onPress={handleDisconnect}
                      variant="danger"
                      fullWidth
                    />
                  </View>
                </View>
              )}
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
  connectedActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionButtonWrapper: {
    flex: 1,
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  chip: {
    minWidth: 72,
  },
  devicesHeading: {
    ...textStyles.caption,
    color: colors.text.secondary,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
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
