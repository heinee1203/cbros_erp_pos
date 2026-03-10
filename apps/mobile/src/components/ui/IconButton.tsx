import React from 'react';
import { Pressable, StyleSheet, ViewStyle } from 'react-native';
import { colors, radius } from '@/theme';

type IconButtonVariant = 'ghost' | 'surface' | 'accent';

interface IconButtonProps {
  children: React.ReactNode;
  onPress: () => void;
  size?: number;
  variant?: IconButtonVariant;
  disabled?: boolean;
  style?: ViewStyle;
}

const variantBg: Record<IconButtonVariant, string> = {
  ghost: colors.transparent,
  surface: colors.bg.surface,
  accent: colors.accent.primary,
};

export function IconButton({
  children,
  onPress,
  size = 44,
  variant = 'ghost',
  disabled = false,
  style,
}: IconButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: variantBg[variant],
          opacity: pressed ? 0.7 : disabled ? 0.4 : 1,
        },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
