import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors } from '@/theme';

interface Props {
  stockLevel: number;
  reorderPoint: number;
}

export default function StockBadge({ stockLevel, reorderPoint }: Props) {
  const color =
    stockLevel <= 0 ? colors.stock.out :
    stockLevel <= reorderPoint ? colors.stock.low :
    colors.stock.ok;

  return <View style={[styles.dot, { backgroundColor: color }]} />;
}

const styles = StyleSheet.create({
  dot: { width: 10, height: 10, borderRadius: 5 },
});
