import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Button, Icon } from '@/components/ui';
import { usePrinter } from '@/hardware/printer/context';
import { usePosPermission } from '@/hooks/use-pos-permission';
import {
  getHardwareCertificationSummary,
  getHardwareTestResults,
  onHardwareTestResultsChanged,
} from '@/storage/hardware-tests';
import {
  getSetupWizardProgress,
  markSetupWizardStepComplete,
  resetSetupWizardProgress,
  SETUP_WIZARD_STEPS,
  subscribeSetupWizardProgress,
  type SetupWizardStep,
} from '@/storage/setup-wizard';
import { colors, fonts, fontSize, radius, spacing, textStyles } from '@/theme';

const HARDWARE_STEP_MAP: Partial<Record<SetupWizardStep, string>> = {
  'receipt-test': 'receipt-printer',
  'label-test': 'label-printer',
  'scanner-test': 'scanner',
  'manager-auth-test': 'manager-authorization',
  'drawer-kick': 'cash-drawer',
};

export default function SetupWizardScreen() {
  const navigation = useNavigation<any>();
  const printer = usePrinter();
  const { can } = usePosPermission();
  const [progress, setProgress] = useState(() => getSetupWizardProgress());
  const [hardwareResults, setHardwareResults] = useState(() => getHardwareTestResults());
  const styles = createStyles();

  useEffect(() => subscribeSetupWizardProgress(setProgress), []);
  useEffect(() => onHardwareTestResultsChanged(setHardwareResults), []);

  const completedSteps = useMemo(() => {
    const completed = new Set(progress.completedSteps);
    if (printer.isConnected) completed.add('connect-printer');
    for (const step of SETUP_WIZARD_STEPS) {
      const hardwareType = HARDWARE_STEP_MAP[step.id];
      if (!hardwareType) continue;
      const passed = hardwareResults.some(result => result.type === hardwareType && result.status === 'pass');
      if (passed) completed.add(step.id);
    }
    return completed;
  }, [hardwareResults, printer.isConnected, progress.completedSteps]);

  const readiness = getHardwareCertificationSummary(hardwareResults);
  const completeCount = completedSteps.size;
  const allComplete = completeCount >= SETUP_WIZARD_STEPS.length && readiness.state !== 'blocked';
  const canRunWizard = can('runSetupWizard');

  const markComplete = useCallback((step: SetupWizardStep) => {
    if (!canRunWizard) {
      Alert.alert('Lead Cashier Required', 'Lead cashier, manager, or admin access is required to complete setup wizard steps.');
      return;
    }
    markSetupWizardStepComplete(step);
  }, [canRunWizard]);

  const reset = useCallback(() => {
    Alert.alert('Reset Setup Wizard', 'Clear the local setup checklist for this tablet?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: resetSetupWizardProgress },
    ]);
  }, []);

  return (
    <SafeAreaView
      style={styles.container}
      testID="setup-wizard-screen"
      accessibilityLabel="Setup wizard screen"
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Icon name="settings" size={26} color={colors.accent.primary} />
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Setup Wizard</Text>
            <Text style={styles.subtitle}>Guided register setup for store staff before a pilot shift.</Text>
          </View>
        </View>

        <View style={[
          styles.readinessCard,
          readiness.state === 'ready' && styles.readinessReady,
          readiness.state === 'blocked' && styles.readinessBlocked,
        ]}>
          <Text style={styles.readinessTitle}>
            {allComplete ? 'READY' : readiness.state.toUpperCase()} / {completeCount} of {SETUP_WIZARD_STEPS.length} steps
          </Text>
          <Text style={styles.readinessText}>{readiness.detail}</Text>
          <Text style={styles.readinessText}>
            Printer: {printer.isConnected ? `Connected (${printer.type.toUpperCase()})` : 'Not connected'}
          </Text>
        </View>

        <View style={styles.stepList}>
          {SETUP_WIZARD_STEPS.map(step => {
            const done = completedSteps.has(step.id);
            return (
              <View key={step.id} style={styles.stepRow}>
                <View style={[styles.stepDot, done && styles.stepDotDone]}>
                  {done ? <Icon name="check" size={16} color={colors.text.inverse} /> : null}
                </View>
                <View style={styles.stepCopy}>
                  <Text style={styles.stepTitle}>{step.label}</Text>
                  <Text style={styles.stepDetail}>{stepDetail(step.id, printer.isConnected)}</Text>
                </View>
                {!done ? (
                  <Pressable
                    style={[styles.markButton, !canRunWizard && styles.markButtonDisabled]}
                    onPress={() => markComplete(step.id)}
                    disabled={!canRunWizard}
                    android_ripple={{ color: colors.accent.glow }}
                  >
                    <Text style={styles.markButtonText}>Mark</Text>
                  </Pressable>
                ) : (
                  <Text style={styles.doneText}>Done</Text>
                )}
              </View>
            );
          })}
        </View>

        <View style={styles.actions}>
          <Button title="Open Printer Setup" onPress={() => navigation.navigate('PrinterSetup')} variant="secondary" fullWidth />
          <Button title="Open Hardware Certification" onPress={() => navigation.navigate('SyncManagement')} variant="secondary" fullWidth />
          <Button title="Reset Checklist" onPress={reset} variant="ghost" disabled={!canRunWizard} fullWidth />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function stepDetail(step: SetupWizardStep, printerConnected: boolean): string {
  if (step === 'connect-printer') return printerConnected ? 'Printer connection detected.' : 'Pair the receipt printer before print and drawer tests.';
  if (step === 'receipt-test') return 'Send a receipt test page from Recovery & Diagnostics.';
  if (step === 'label-test') return 'Send a ZPL shelf label test from Recovery & Diagnostics.';
  if (step === 'scanner-test') return 'Scan or type a barcode and record the result.';
  if (step === 'manager-auth-test') return 'Validate manager PIN, barcode, or card approval.';
  return 'Send a drawer kick through the connected receipt printer.';
}

const createStyles = () => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 90,
    gap: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    ...textStyles.heading,
    color: colors.text.primary,
  },
  subtitle: {
    ...textStyles.body,
    color: colors.text.secondary,
    marginTop: 2,
  },
  readinessCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.status.warning,
    backgroundColor: colors.status.warningBg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  readinessReady: {
    borderColor: colors.status.success,
    backgroundColor: colors.status.successBg,
  },
  readinessBlocked: {
    borderColor: colors.status.danger,
    backgroundColor: colors.status.dangerBg,
  },
  readinessTitle: {
    fontFamily: fonts.display.bold,
    fontSize: fontSize.lg,
    color: colors.text.primary,
  },
  readinessText: {
    ...textStyles.caption,
    color: colors.text.secondary,
  },
  stepList: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.bg.surface,
    overflow: 'hidden',
  },
  stepRow: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotDone: {
    borderColor: colors.status.success,
    backgroundColor: colors.status.success,
  },
  stepCopy: {
    flex: 1,
  },
  stepTitle: {
    color: colors.text.primary,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.base,
  },
  stepDetail: {
    ...textStyles.caption,
    color: colors.text.secondary,
    marginTop: 2,
  },
  markButton: {
    minWidth: 68,
    minHeight: 36,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg.elevated,
  },
  markButtonDisabled: {
    opacity: 0.45,
  },
  markButtonText: {
    color: colors.accent.primary,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.sm,
  },
  doneText: {
    color: colors.status.success,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.sm,
  },
  actions: {
    gap: spacing.sm,
  },
});
