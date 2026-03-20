import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import StockBadge from './StockBadge';
import type { CatalogItem } from '@/hooks/use-catalog-search';
import { colors } from '@/theme';

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
  const styles = createStyles();
  const available = item.stockLevel - item.reservedLevel;
  const hasVariants = item.isParent;
  const isOOS = available <= 0 && !hasVariants;
  const priceIsZero = item.unitPrice === 0;

  const renderPrice = () => {
    if (hasVariants) {
      return (
        <View style={styles.variantBadge}>
          <Text style={styles.variantBadgeText}>VARIANTS</Text>
        </View>
      );
    }
    if (item.isVariablePrice) {
      return (
        <View style={styles.variablePriceBadge}>
          <Text style={styles.variablePriceIcon}>{'\u270E'}</Text>
          <Text style={styles.variablePriceText}>Enter Price</Text>
        </View>
      );
    }
    if (priceIsZero) {
      return <Text style={styles.priceNotSet}>No Price</Text>;
    }
    return <Text style={styles.priceText}>{fmtPrice(item.unitPrice)}</Text>;
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        pressed && styles.rowPressed,
        isOOS && styles.rowOOS,
      ]}
      onPress={() => onPress(item)}
      onLongPress={() => onLongPress?.(item)}
      android_ripple={isOOS ? undefined : { color: 'rgba(245,166,35,0.06)' }}
    >
      <View style={styles.left}>
        <Text style={styles.productName} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={styles.skuText} numberOfLines={1}>
          {item.sku}
        </Text>
      </View>
      <View style={styles.right}>
        {renderPrice()}
        <StockBadge available={available} />
      </View>
    </Pressable>
  );
}

export default React.memo(ProductListItem);

const createStyles = () => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 18,
    minHeight: 64,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  rowPressed: {
    backgroundColor: 'rgba(245,166,35,0.06)',
  },
  rowOOS: {
    opacity: 0.65,
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
    lineHeight: 20,
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
  priceNotSet: {
    fontSize: 14,
    fontFamily: 'Outfit-Medium',
    color: '#5A5750',
    fontStyle: 'italic',
  },
  variablePriceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245,166,35,0.06)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  variablePriceIcon: {
    fontSize: 12,
    color: '#F5A623',
  },
  variablePriceText: {
    fontSize: 12,
    fontFamily: 'Outfit-SemiBold',
    color: '#F5A623',
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
