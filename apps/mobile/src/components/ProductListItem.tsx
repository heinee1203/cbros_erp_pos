import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import StockBadge from './StockBadge';
import { colors, textStyles, layout } from '@/theme';
import type { CatalogItem } from '@/hooks/use-catalog-search';

interface Props {
  item: CatalogItem;
  index: number;
  onPress: (item: CatalogItem) => void;
  onLongPress?: (item: CatalogItem) => void;
}

function fmtPrice(amount: number): string {
  return `\u20B1${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getStockColor(available: number, reorderPoint: number): string {
  if (available <= 0) return colors.stock.out;
  if (available <= reorderPoint) return colors.stock.low;
  return colors.stock.ok;
}

function ProductListItem({ item, index, onPress, onLongPress }: Props) {
  const available = item.stockLevel - item.reservedLevel;
  const rowBg = index % 2 === 0 ? colors.bg.primary : colors.bg.surface;
  const stockColor = getStockColor(available, item.reorderPoint);

  return (
    <Pressable
      style={[styles.row, { backgroundColor: rowBg }]}
      onPress={() => onPress(item)}
      onLongPress={() => onLongPress?.(item)}
      android_ripple={{ color: colors.accent.glow }}
    >
      <View style={styles.left}>
        <Text style={styles.mnemonicSku} numberOfLines={1}>
          {item.mnemonicSku}
        </Text>
        <Text style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.fullSku}>{item.sku}</Text>
      </View>
      <View style={styles.right}>
        <Text style={styles.price}>
          {item.isParent ? 'Variants' : item.isVariablePrice ? 'Variable' : fmtPrice(item.unitPrice)}
        </Text>
        <View style={styles.stockRow}>
          <StockBadge stockLevel={available} reorderPoint={item.reorderPoint} />
          <Text style={[styles.stockText, { color: stockColor }]}>{available}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export default React.memo(ProductListItem);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.screenPadding,
    paddingVertical: 10,
    minHeight: layout.productRowMinHeight,
  },
  left: {
    flex: 1,
    marginRight: 12,
  },
  right: {
    alignItems: 'flex-end',
  },
  mnemonicSku: {
    ...textStyles.monoMd,
    color: colors.text.primary,
  },
  name: {
    ...textStyles.caption,
    color: colors.text.secondary,
    marginTop: 2,
  },
  fullSku: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
    marginTop: 1,
  },
  price: {
    ...textStyles.monoMd,
    color: colors.accent.primary,
  },
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  stockText: {
    ...textStyles.captionSmall,
  },
});
