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
  const styles = createStyles();
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

const createStyles = () => StyleSheet.create({
  base: {
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
  },
  elevated: {
    backgroundColor: colors.bg.surface,
    borderColor: colors.border.default,
    elevation: 1,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  padded: {
    padding: spacing.lg,
  },
});
