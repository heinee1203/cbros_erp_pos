import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, fonts, fontSize, radius, spacing } from '@/theme';
import { Icon } from '@/components/ui';
import {
  recordScannerError,
  recordScannerScan,
  setScannerCaptureActive,
} from '@/storage/scanner-diagnostics';

interface BarcodeScanModalProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  placeholder?: string;
  actionLabel?: string;
  onSubmit: (barcode: string) => Promise<boolean | void> | boolean | void;
  onClose: () => void;
}

export function BarcodeScanModal({
  visible,
  title,
  subtitle = 'Scan with the paired barcode scanner, or type the barcode manually.',
  placeholder = 'Barcode',
  actionLabel = 'Use Barcode',
  onSubmit,
  onClose,
}: BarcodeScanModalProps) {
  const [value, setValue] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const styles = createStyles();

  useEffect(() => {
    if (!visible) return undefined;

    setValue('');
    setMessage(null);
    setScannerCaptureActive(true, title);
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 180);

    return () => {
      clearTimeout(timer);
      setScannerCaptureActive(false);
    };
  }, [title, visible]);

  const handleSubmit = useCallback(async () => {
    const barcode = value.trim();
    if (barcode.length < 4) {
      setMessage('Enter or scan at least 4 characters.');
      recordScannerError('manual', 'Barcode input shorter than 4 characters.', title);
      inputRef.current?.focus();
      return;
    }

    setSubmitting(true);
    setMessage(null);
    try {
      recordScannerScan('manual', barcode, undefined, title);
      const accepted = await onSubmit(barcode);
      if (accepted === false) {
        setMessage('Barcode was not accepted. Try another code.');
        recordScannerError('manual', 'Barcode was not accepted.', title);
        inputRef.current?.focus();
        return;
      }

      setValue('');
      onClose();
    } finally {
      setSubmitting(false);
    }
  }, [onClose, onSubmit, title, value]);

  const disabled = submitting || value.trim().length < 4;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      accessibilityLabel="Barcode scan modal"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <View style={styles.panel}>
          <View style={styles.headerRow}>
            <View style={styles.iconBadge}>
              <Icon name="barcode" size={20} color={colors.accent.primary} />
            </View>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
            </View>
          </View>

          <View style={styles.inputShell}>
            <Text style={styles.inputLabel}>Barcode Input</Text>
            <TextInput
              ref={inputRef}
              testID="barcode-scan-input"
              accessibilityLabel="Barcode scan input"
              style={styles.input}
              value={value}
              onChangeText={setValue}
              placeholder={placeholder}
              placeholderTextColor={colors.text.muted}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="search"
              selectTextOnFocus
              blurOnSubmit={false}
              onSubmitEditing={handleSubmit}
              selectionColor={colors.accent.primary}
              cursorColor={colors.accent.primary}
            />
          </View>

          <View style={styles.statusRow}>
            <View style={styles.readyDot} />
            <Text style={styles.statusText}>
              {message || 'Ready for scanner input'}
            </Text>
          </View>

          <View style={styles.actions}>
            <Pressable
              testID="barcode-scan-cancel"
              accessibilityLabel="Cancel barcode scan"
              style={styles.cancelButton}
              onPress={onClose}
              disabled={submitting}
              android_ripple={{ color: colors.accent.glow }}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              testID="barcode-scan-submit"
              accessibilityLabel={actionLabel}
              style={[styles.submitButton, disabled && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={disabled}
              android_ripple={{ color: colors.accent.pressed }}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={colors.text.inverse} />
              ) : (
                <Text style={styles.submitText}>{actionLabel}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = () => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(23,32,51,0.32)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  panel: {
    width: '100%',
    maxWidth: 520,
    borderRadius: radius.md,
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    padding: spacing.lg,
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  iconBadge: {
    width: 46,
    height: 46,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border.light,
    backgroundColor: colors.accent.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    color: colors.text.primary,
    fontFamily: fonts.display.bold,
    fontSize: fontSize.lg,
  },
  subtitle: {
    color: colors.text.secondary,
    fontFamily: fonts.body.regular,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  inputShell: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.bg.input,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  inputLabel: {
    color: colors.text.muted,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
  },
  input: {
    minHeight: 50,
    color: colors.text.primary,
    fontFamily: fonts.display.bold,
    fontSize: fontSize.xl,
    paddingVertical: spacing.xs,
  },
  statusRow: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  readyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.status.success,
  },
  statusText: {
    flex: 1,
    color: colors.text.muted,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.sm,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  cancelButton: {
    minWidth: 104,
    minHeight: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border.light,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bg.surface,
  },
  cancelText: {
    color: colors.text.secondary,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.sm,
  },
  submitButton: {
    minWidth: 138,
    minHeight: 44,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    backgroundColor: colors.accent.primary,
  },
  submitButtonDisabled: {
    backgroundColor: colors.border.medium,
  },
  submitText: {
    color: colors.text.inverse,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.sm,
  },
});
