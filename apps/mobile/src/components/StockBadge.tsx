import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { colors, fonts, fontSize, radius, spacing } from '@/theme';

interface StockBadgeProps {
  available: number;
  lowThreshold?: number;
  sellingUnit?: string;
}

export default function StockBadge({ available, lowThreshold = 5, sellingUnit }: StockBadgeProps) {
  const styles = createStyles();
  const unit = sellingUnit && sellingUnit !== "piece" ? ` ${sellingUnit}` : "";
  if (available <= 0) {
    return <Text style={styles.out}>Out of Stock</Text>;
  }
  if (available <= lowThreshold) {
    return <Text style={styles.low}>Low: {available}{unit}</Text>;
  }
  return <Text style={styles.ok}>{available}{unit} in stock</Text>;
}

function createStyles() {
  return StyleSheet.create({
    out: {
      fontSize: fontSize.xs,
      fontFamily: fonts.display.semiBold,
      color: colors.status.out,
      backgroundColor: colors.status.dangerBg,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.sm,
      overflow: 'hidden',
      letterSpacing: 0,
    },
    low: {
      fontSize: fontSize.xs,
      fontFamily: fonts.display.semiBold,
      color: colors.status.low,
      backgroundColor: colors.status.warningBg,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.sm,
      overflow: 'hidden',
      letterSpacing: 0,
    },
    ok: {
      fontSize: fontSize.xs,
      fontFamily: fonts.body.medium,
      color: colors.text.secondary,
    },
  });
}
