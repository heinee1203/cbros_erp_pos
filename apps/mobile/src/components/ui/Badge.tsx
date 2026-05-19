import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, textStyles, spacing, radius } from '@/theme';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info';

interface BadgeProps {
  label: string;
  variant: BadgeVariant;
}

const getVariantColors = (): Record<BadgeVariant, { bg: string; text: string }> => ({
  success: { bg: colors.status.successBg, text: colors.status.successText },
  warning: { bg: colors.status.warningBg, text: colors.status.warningText },
  danger: { bg: colors.status.dangerBg, text: colors.status.dangerText },
  info: { bg: colors.status.infoBg, text: colors.status.infoText },
});

export function Badge({ label, variant }: BadgeProps) {
  const styles = createStyles();
  const variantColors = getVariantColors();
  const vc = variantColors[variant];

  return (
    <View style={[styles.container, { backgroundColor: vc.bg }]}>
      <Text style={[styles.label, { color: vc.text }]}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  container: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  label: {
    ...textStyles.captionSmall,
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
});
