import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { colors, spacing, radius } from '@/theme';

interface CardProps {
  children: React.ReactNode;
  elevated?: boolean;
  style?: ViewStyle;
  padded?: boolean;
}

export function Card({
  children,
  elevated = false,
  style,
  padded = true,
}: CardProps) {
  return (
    <View
      style={[
        styles.base,
        elevated && styles.elevated,
        padded && styles.padded,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: radius.sm,
  },
  elevated: {
    backgroundColor: colors.bg.elevated,
  },
  padded: {
    padding: spacing.lg,
  },
});
