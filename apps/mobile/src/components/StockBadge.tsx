import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { colors } from '@/theme';

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
      fontSize: 11,
      fontFamily: 'Outfit-SemiBold',
      color: colors.status.out,
      backgroundColor: colors.status.dangerBg,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 4,
      overflow: 'hidden',
      letterSpacing: 0.2,
    },
    low: {
      fontSize: 11,
      fontFamily: 'Outfit-SemiBold',
      color: colors.status.low,
      backgroundColor: colors.status.warningBg,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 4,
      overflow: 'hidden',
      letterSpacing: 0.2,
    },
    ok: {
      fontSize: 11,
      fontFamily: 'DMSans-Regular',
      color: colors.text.secondary,
    },
  });
}
