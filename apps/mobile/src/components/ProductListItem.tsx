import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import StockBadge from './StockBadge';
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

function ProductListItem({ item, index, onPress, onLongPress }: Props) {
  const available = item.stockLevel - item.reservedLevel;
  const hasVariants = item.isParent;
  const priceIsZero = item.unitPrice === 0;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        pressed && styles.rowPressed,
      ]}
      onPress={() => onPress(item)}
      onLongPress={() => onLongPress?.(item)}
      android_ripple={{ color: 'rgba(245,166,35,0.06)' }}
    >
      <View style={styles.left}>
        <Text style={styles.productName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.skuText} numberOfLines={1}>
          {item.sku}
        </Text>
      </View>
      <View style={styles.right}>
        {hasVariants ? (
          <View style={styles.variantBadge}>
            <Text style={styles.variantBadgeText}>VARIANTS</Text>
          </View>
        ) : (
          <Text style={[styles.priceText, priceIsZero && styles.priceMuted]}>
            {item.isVariablePrice ? 'Variable' : fmtPrice(item.unitPrice)}
          </Text>
        )}
        <StockBadge available={available} />
      </View>
    </Pressable>
  );
}

export default React.memo(ProductListItem);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 64,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  rowPressed: {
    backgroundColor: 'rgba(245,166,35,0.06)',
  },
  left: {
    flex: 1,
    marginRight: 12,
  },
  right: {
    alignItems: 'flex-end',
    gap: 4,
  },
  productName: {
    fontSize: 15,
    fontFamily: 'Outfit-SemiBold',
    color: '#F2F0ED',
  },
  skuText: {
    fontSize: 12,
    fontFamily: 'JetBrainsMono-Regular',
    color: '#5A5750',
    marginTop: 2,
  },
  priceText: {
    fontSize: 16,
    fontFamily: 'Outfit-Bold',
    color: '#F5A623',
  },
  priceMuted: {
    color: '#5A5750',
  },
  variantBadge: {
    backgroundColor: 'rgba(245,166,35,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  variantBadgeText: {
    fontSize: 11,
    fontFamily: 'Outfit-SemiBold',
    color: '#F5A623',
    letterSpacing: 0.5,
  },
});
