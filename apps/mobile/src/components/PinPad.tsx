import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  Animated,
  StyleSheet,
} from 'react-native';
import { colors, textStyles, spacing, radius, touchTarget } from '@/theme';

interface PinPadProps {
  visible: boolean;
  onClose: () => void;
  onVerified: () => void;
  verifyPin: (pin: string) => Promise<boolean>;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

export function PinPad({ visible, onClose, onVerified, verifyPin }: PinPadProps) {
  const styles = createStyles();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const shake = useCallback(() => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  const handleKey = useCallback(async (key: string) => {
    if (verifying) return;

    if (key === '⌫') {
      setPin(prev => prev.slice(0, -1));
      setError('');
      return;
    }

    if (key === '' || pin.length >= 4) return;

    const newPin = pin + key;
    setPin(newPin);
    setError('');

    // Auto-submit on 4th digit
    if (newPin.length === 4) {
      setVerifying(true);
      try {
        const valid = await verifyPin(newPin);
        if (valid) {
          setPin('');
          onVerified();
        } else {
          shake();
          setPin('');
          setError('Invalid PIN');
        }
      } catch {
        shake();
        setPin('');
        setError('Verification failed');
      }
      setVerifying(false);
    }
  }, [pin, verifying, verifyPin, onVerified, shake]);

  const handleClose = useCallback(() => {
    setPin('');
    setError('');
    onClose();
  }, [onClose]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={styles.container}>
          <Text style={styles.title}>Manager PIN</Text>
          <Text style={styles.subtitle}>Enter 4-digit PIN to authorize</Text>

          <Animated.View
            style={[styles.dotsRow, { transform: [{ translateX: shakeAnim }] }]}
          >
            {[0, 1, 2, 3].map(i => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i < pin.length && styles.dotFilled,
                  error ? styles.dotError : undefined,
                ]}
              />
            ))}
          </Animated.View>

          {error ? <Text style={styles.error}>{error}</Text> : <View style={styles.errorSpacer} />}

          <View style={styles.keypad}>
            {KEYS.map((key, i) => (
              <Pressable
                key={i}
                style={({ pressed }) => [
                  styles.key,
                  key === '' && styles.keyEmpty,
                  key !== '' && pressed && styles.keyPressed,
                ]}
                onPress={() => handleKey(key)}
                disabled={key === '' || verifying}
                android_ripple={key !== '' ? { color: colors.accent.glow } : undefined}
              >
                <Text style={[
                  styles.keyText,
                  key === '⌫' && styles.keyBackspace,
                ]}>
                  {key}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable style={styles.cancelButton} onPress={handleClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = () => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: colors.bg.elevated,
    borderRadius: radius.md,
    padding: spacing['2xl'],
    width: 300,
    alignItems: 'center',
  },
  title: {
    ...textStyles.heading,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...textStyles.caption,
    color: colors.text.secondary,
    marginBottom: spacing.xl,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginBottom: spacing.md,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.border.default,
    backgroundColor: colors.transparent,
  },
  dotFilled: {
    backgroundColor: colors.accent.primary,
    borderColor: colors.accent.primary,
  },
  dotError: {
    borderColor: colors.status.danger,
  },
  error: {
    ...textStyles.captionSmall,
    color: colors.status.danger,
    height: 20,
    marginBottom: spacing.md,
  },
  errorSpacer: {
    height: 20,
    marginBottom: spacing.md,
  },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 240,
    gap: spacing.sm,
  },
  key: {
    width: 72,
    height: 56,
    borderRadius: radius.sm,
    backgroundColor: colors.bg.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyEmpty: {
    backgroundColor: colors.transparent,
  },
  keyPressed: {
    backgroundColor: colors.border.default,
  },
  keyText: {
    ...textStyles.heading,
    color: colors.text.primary,
  },
  keyBackspace: {
    fontSize: 22,
  },
  cancelButton: {
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing['2xl'],
  },
  cancelText: {
    ...textStyles.bodyMedium,
    color: colors.text.muted,
  },
});
