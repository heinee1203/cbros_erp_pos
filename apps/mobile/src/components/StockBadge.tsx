import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface StockBadgeProps {
  available: number;
  lowThreshold?: number;
}

export default function StockBadge({ available, lowThreshold = 5 }: StockBadgeProps) {
  if (available > lowThreshold) {
    // In stock — show nothing (clean design)
    return null;
  }

  const isOut = available <= 0;
  const label = isOut ? 'Out of Stock' : `Low: ${available}`;
  const bgColor = isOut ? 'rgba(255,59,48,0.12)' : 'rgba(255,179,0,0.12)';
  const textColor = isOut ? '#FF3B30' : '#FFB300';

  return (
    <View style={[styles.badge, { backgroundColor: bgColor }]}>
      <Text style={[styles.text, { color: textColor }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  text: {
    fontSize: 11,
    fontFamily: 'Outfit-SemiBold',
    letterSpacing: 0.2,
  },
});
