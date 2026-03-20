import React from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { colors, textStyles, spacing, radius } from '@/theme';

interface FavoriteTileProps {
  name: string;
  price: number;
  stockLevel: number;
  reorderPoint: number;
  onPress: () => void;
  onLongPress: () => void;
}

function FavoriteTileInner({
  name, price, stockLevel, reorderPoint, onPress, onLongPress,
}: FavoriteTileProps) {
  const styles = createStyles();
  const stockColor =
    stockLevel <= 0 ? colors.stock.out :
    stockLevel <= reorderPoint ? colors.stock.low :
    colors.stock.ok;

  return (
    <Pressable
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
      onPress={onPress}
      onLongPress={onLongPress}
      android_ripple={{ color: colors.accent.glow }}
    >
      <View style={styles.accentBar} />
      <View style={styles.content}>
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        <Text style={styles.price}>
          {'\u20B1'}{price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
        </Text>
        <View style={styles.stockRow}>
          <View style={[styles.stockDot, { backgroundColor: stockColor }]} />
          <Text style={[styles.stockText, { color: stockColor }]}>{stockLevel}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export const FavoriteTile = React.memo(FavoriteTileInner);

const createStyles = () => StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: colors.bg.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border.default,
    overflow: 'hidden',
    flexDirection: 'row',
    minHeight: 72,
  },
  pressed: { opacity: 0.8 },
  accentBar: {
    width: 4,
    backgroundColor: colors.accent.primary,
  },
  content: {
    flex: 1,
    padding: spacing.sm,
    justifyContent: 'center',
  },
  name: {
    ...textStyles.caption,
    color: colors.text.primary,
    marginBottom: 2,
  },
  price: {
    ...textStyles.monoSm,
    color: colors.accent.primary,
    marginBottom: 2,
  },
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stockDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  stockText: {
    ...textStyles.captionSmall,
    fontSize: 10,
  },
});
