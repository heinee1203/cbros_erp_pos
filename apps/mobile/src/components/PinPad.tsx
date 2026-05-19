import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  Animated,
  StyleSheet,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useScanner } from '@/hardware/scanner/context';
import { colors, textStyles, spacing, radius, touchTarget } from '@/theme';
import { Icon } from '@/components/ui';
import {
  parseAuthorizationCredentialInput,
} from '@/utils/authorization-credentials';

interface PinPadProps {
  visible: boolean;
  onClose: () => void;
  onVerified: () => void;
  verifyPin: (pin: string) => Promise<boolean>;
  subtitle?: string;
  verifyCredential?: (credential: string, method: 'barcode' | 'card') => Promise<boolean>;
  embedded?: boolean;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'DEL'];

export function PinPad({
  visible,
  onClose,
  onVerified,
  verifyPin,
  subtitle = 'Enter 4-digit PIN to authorize',
  verifyCredential,
  embedded = false,
}: PinPadProps) {
  const styles = createStyles();
  const scanner = useScanner();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [credentialInput, setCredentialInput] = useState('');
  const [credentialStatus, setCredentialStatus] = useState('');
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const credentialInputRef = useRef<TextInput>(null);
  const verifyingRef = useRef(false);

  const shake = useCallback(() => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  const finishVerification = useCallback((valid: boolean, message = 'Invalid PIN') => {
    if (valid) {
      setPin('');
      setCredentialInput('');
      setCredentialStatus('');
      onVerified();
      return;
    }
    shake();
    setPin('');
    setCredentialInput('');
    setCredentialStatus('');
    setError(message);
  }, [onVerified, shake]);

  const focusCredentialInput = useCallback(() => {
    if (visible && verifyCredential && !verifyingRef.current) {
      credentialInputRef.current?.focus();
    }
  }, [verifyCredential, visible]);

  const verifyScannedCredential = useCallback(async (credential: string) => {
    if (!verifyCredential || verifyingRef.current) return;
    const parsed = parseAuthorizationCredentialInput(credential);
    if (!parsed?.credential) return;

    verifyingRef.current = true;
    setVerifying(true);
    setError('');
    setCredentialStatus(`${parsed.label} detected`);
    try {
      const valid = await verifyCredential(parsed.credential, parsed.method);
      finishVerification(valid, `${parsed.label} not authorized`);
    } catch {
      finishVerification(false, 'Verification failed');
    } finally {
      verifyingRef.current = false;
      setVerifying(false);
    }
  }, [finishVerification, verifyCredential]);

  const handleCredentialInputChange = useCallback((value: string) => {
    setCredentialInput(value);
    setError('');
    const parsed = parseAuthorizationCredentialInput(value);
    if (parsed) {
      setCredentialStatus(parsed.complete ? `${parsed.label} captured` : 'Reading credential...');
    }
    if (parsed?.complete) {
      setTimeout(() => void verifyScannedCredential(value), 80);
    }
  }, [verifyScannedCredential]);

  useEffect(() => {
    if (!visible || !verifyCredential) return;

    setCredentialInput('');
    const focusTimer = setTimeout(focusCredentialInput, 100);
    const refocusTimer = setInterval(focusCredentialInput, 1500);
    scanner.startListening();
    const unsubscribe = scanner.onScan(result => {
      void verifyScannedCredential(result.barcode);
    });

    return () => {
      clearTimeout(focusTimer);
      clearInterval(refocusTimer);
      unsubscribe();
      scanner.stopListening();
    };
  }, [focusCredentialInput, scanner, verifyCredential, verifyScannedCredential, visible]);

  const handleKey = useCallback(async (key: string) => {
    if (verifyingRef.current) return;

    if (key === 'DEL') {
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
      verifyingRef.current = true;
      setVerifying(true);
      try {
        const valid = await verifyPin(newPin);
        finishVerification(valid);
      } catch {
        finishVerification(false, 'Verification failed');
      } finally {
        verifyingRef.current = false;
        setVerifying(false);
      }
    }
  }, [finishVerification, pin, verifyPin]);

  const handleClose = useCallback(() => {
    verifyingRef.current = false;
    setPin('');
    setError('');
    setCredentialInput('');
    setCredentialStatus('');
    onClose();
  }, [onClose]);

  const content = (
    <View style={embedded ? styles.embeddedContainer : styles.container}>
      {!embedded && (
        <>
          <Text style={styles.title}>Manager PIN</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </>
      )}
      {verifyCredential && (
        <>
          <Pressable
            style={[styles.credentialPanel, (verifying || Boolean(credentialStatus)) && styles.credentialPanelActive]}
            onPress={focusCredentialInput}
          >
            {verifying ? (
              <ActivityIndicator color={colors.accent.primary} size="small" />
            ) : (
              <View style={styles.credentialIcons}>
                <Icon name="barcode" size={20} color={colors.accent.primary} strokeWidth={2.2} />
                <Icon name="card" size={20} color={colors.accent.primary} strokeWidth={2.2} />
              </View>
            )}
            <View style={styles.credentialCopy}>
              <Text style={styles.credentialTitle}>
                {verifying ? 'Checking authorization' : credentialStatus || 'Scan manager badge or swipe card'}
              </Text>
              <Text style={styles.credentialSubtitle}>
                PIN stays available below; scanner and card input are captured automatically.
              </Text>
            </View>
          </Pressable>
          <TextInput
            ref={credentialInputRef}
            value={credentialInput}
            onChangeText={handleCredentialInputChange}
            onSubmitEditing={() => void verifyScannedCredential(credentialInput)}
            onBlur={() => setTimeout(focusCredentialInput, 50)}
            autoCapitalize="characters"
            autoCorrect={false}
            blurOnSubmit={false}
            caretHidden
            showSoftInputOnFocus={false}
            style={styles.credentialInput}
          />
        </>
      )}

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
              key === 'DEL' && styles.keyBackspace,
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
  );

  if (embedded) return content;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        {content}
      </View>
    </Modal>
  );
}

const createStyles = () => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: colors.bg.surface,
    borderRadius: radius.xl,
    padding: spacing['2xl'],
    width: 320,
    alignItems: 'center',
  },
  embeddedContainer: {
    width: '100%',
    alignItems: 'center',
  },
  credentialInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  credentialPanel: {
    width: '100%',
    minHeight: 58,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.bg.elevated,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.lg,
  },
  credentialPanelActive: {
    borderColor: colors.accent.primary,
    backgroundColor: colors.accent.muted,
  },
  credentialIcons: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.accent.glow,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 2,
  },
  credentialCopy: {
    flex: 1,
    minWidth: 0,
  },
  credentialTitle: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
  },
  credentialSubtitle: {
    ...textStyles.captionSmall,
    color: colors.text.secondary,
    marginTop: 2,
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
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.border.medium,
    backgroundColor: colors.transparent,
  },
  dotFilled: {
    backgroundColor: colors.accent.primary,
    borderColor: colors.accent.primary,
  },
  dotError: {
    borderColor: colors.status.danger,
    backgroundColor: colors.status.danger,
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
    width: 264,
    gap: spacing.md,
  },
  key: {
    width: 76,
    height: 60,
    borderRadius: radius.lg,
    backgroundColor: colors.bg.elevated,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden' as any,
  },
  keyEmpty: {
    backgroundColor: colors.transparent,
  },
  keyPressed: {
    backgroundColor: colors.border.default,
  },
  keyText: {
    fontFamily: textStyles.heading.fontFamily,
    fontSize: textStyles.heading.fontSize,
    color: colors.text.primary,
  },
  keyBackspace: {
    fontSize: 22,
    color: colors.text.muted,
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
