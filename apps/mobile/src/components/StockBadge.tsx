import React from 'react';
import { Text, StyleSheet } from 'react-native';

interface StockBadgeProps {
  available: number;
  lowThreshold?: number;
}

export default function StockBadge({ available, lowThreshold = 5 }: StockBadgeProps) {
  if (available <= 0) {
    return <Text style={styles.out}>Out of Stock</Text>;
  }
  if (available <= lowThreshold) {
    return <Text style={styles.low}>Low: {available}</Text>;
  }
  return <Text style={styles.ok}>{available} in stock</Text>;
}

const styles = StyleSheet.create({
  out: {
    fontSize: 11,
    fontFamily: 'Outfit-SemiBold',
    color: '#FF3B30',
    backgroundColor: 'rgba(255,59,48,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
    letterSpacing: 0.2,
  },
  low: {
    fontSize: 11,
    fontFamily: 'Outfit-SemiBold',
    color: '#FFB300',
    backgroundColor: 'rgba(255,179,0,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
    letterSpacing: 0.2,
  },
  ok: {
    fontSize: 11,
    fontFamily: 'DMSans-Regular',
    color: '#5A5750',
  },
});
