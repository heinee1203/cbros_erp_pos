import React, { useEffect, useRef, useCallback } from 'react';
import { Animated, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, textStyles, spacing, radius, layout } from '@/theme';

type ToastVariant = 'success' | 'error' | 'info';

interface ToastProps {
  message: string;
  variant: ToastVariant;
  visible: boolean;
  onDismiss?: () => void;
}

const AUTO_DISMISS_MS = 2000;

const variantColors: Record<ToastVariant, { bg: string; text: string }> = {
  success: { bg: colors.toast.successBg, text: colors.toast.successText },
  error: { bg: colors.toast.errorBg, text: colors.toast.errorText },
  info: { bg: colors.bg.elevated, text: colors.text.primary },
};

export function Toast({ message, variant, visible, onDismiss }: ToastProps) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-100)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        speed: 14,
        bounciness: 6,
      }).start();

      clearTimer();
      if (onDismiss) {
        timerRef.current = setTimeout(() => {
          onDismiss();
        }, AUTO_DISMISS_MS);
      }
    } else {
      Animated.spring(translateY, {
        toValue: -100,
        useNativeDriver: true,
        speed: 14,
        bounciness: 6,
      }).start();
      clearTimer();
    }

    return clearTimer;
  }, [visible, onDismiss, translateY, clearTimer]);

  const vc = variantColors[variant];

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        styles.container,
        {
          top: insets.top + spacing.sm,
          backgroundColor: vc.bg,
          transform: [{ translateY }],
        },
      ]}
    >
      <Text style={[styles.message, { color: vc.text }]}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: layout.screenPadding,
    right: layout.screenPadding,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    zIndex: 9999,
    elevation: 10,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  message: {
    ...textStyles.bodyMedium,
  },
});
