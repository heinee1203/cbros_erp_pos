import React, { useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '@/hooks/use-auth';
import { BarcodeScanModal } from '@/components/BarcodeScanModal';
import { Button } from '@/components/ui';
import { formatPosError } from '@/utils/pos-error-messages';
import { colors, textStyles, spacing, radius, fonts, fontSize } from '@/theme';

interface Props {
  onRegistrationComplete: () => void;
}

function extractRegistrationCode(value: string): string {
  const trimmed = value.trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed.code === 'string') return parsed.code;
  } catch {}
  return trimmed;
}

export default function LocationSelectScreen({ onRegistrationComplete }: Props) {
  const { user, registerWithCode } = useAuth();
  const [registrationCode, setRegistrationCode] = useState('');
  const [scanVisible, setScanVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const styles = createStyles();

  const handleSubmit = async (rawCode = registrationCode) => {
    const code = extractRegistrationCode(rawCode);
    if (code.replace(/[^A-Za-z0-9]/g, '').length < 6) {
      setError('Enter or scan the registration code from ERP.');
      return false;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await registerWithCode(code);
      onRegistrationComplete();
      return true;
    } catch (err) {
      setError(formatPosError(err, 'Registration code could not be used.'));
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView
      style={styles.container}
      testID="store-registration-screen"
      accessibilityLabel="Store registration screen"
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>A</Text>
          </View>
          <Text style={styles.greeting}>
            Welcome, {user?.fullName?.split(' ')[0] || 'User'}
          </Text>
          <Text style={styles.title}>Register This Device</Text>
          <Text style={styles.subtitle}>
            Enter or scan the ERP registration code for this store. After registration,
            this tablet is permanently locked to that store.
          </Text>

          <View style={styles.form}>
            <Text style={styles.label}>Registration Code</Text>
            <TextInput
              testID="registration-code-input"
              accessibilityLabel="Registration code input"
              value={registrationCode}
              onChangeText={(value) => {
                setRegistrationCode(value.toUpperCase());
                setError(null);
              }}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="ABCD-2345"
              placeholderTextColor={colors.text.muted}
              style={styles.input}
              editable={!isSubmitting}
            />
            {error && <Text style={styles.error}>{error}</Text>}
          </View>

          <View style={styles.actions}>
            <Button
              title={isSubmitting ? 'Registering...' : 'Register Device'}
              onPress={() => handleSubmit()}
              loading={isSubmitting}
              disabled={isSubmitting}
              fullWidth
            />
            <Button
              title="Scan QR / Barcode"
              onPress={() => setScanVisible(true)}
              disabled={isSubmitting}
              variant="secondary"
              fullWidth
            />
          </View>

          {isSubmitting && (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={colors.accent.primary} />
              <Text style={styles.loadingText}>Validating code with ERP</Text>
            </View>
          )}
        </View>
      </ScrollView>

      <BarcodeScanModal
        visible={scanVisible}
        title="Scan Registration Code"
        subtitle="Scan the ERP QR code or barcode for this store."
        actionLabel="Use Registration Code"
        onClose={() => setScanVisible(false)}
        onSubmit={(code) => {
          setRegistrationCode(extractRegistrationCode(code).toUpperCase());
          handleSubmit(code);
        }}
      />
    </SafeAreaView>
  );
}

const createStyles = () => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 560,
    backgroundColor: colors.bg.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.default,
    padding: spacing.xl,
  },
  badge: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.accent.muted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  badgeText: {
    color: colors.accent.primary,
    fontFamily: fonts.display.extraBold,
    fontSize: fontSize['4xl'],
  },
  greeting: {
    ...textStyles.body,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  title: {
    ...textStyles.heading,
    color: colors.text.primary,
    fontSize: 26,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...textStyles.body,
    color: colors.text.muted,
    lineHeight: 22,
  },
  form: {
    marginTop: spacing.xl,
  },
  label: {
    ...textStyles.caption,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  input: {
    minHeight: 56,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.bg.primary,
    paddingHorizontal: spacing.md,
    color: colors.text.primary,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.lg,
    letterSpacing: 0,
  },
  error: {
    ...textStyles.caption,
    color: colors.status.danger,
    marginTop: spacing.sm,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  loadingText: {
    ...textStyles.caption,
    color: colors.text.secondary,
  },
});
