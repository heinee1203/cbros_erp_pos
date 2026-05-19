import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import StockBadge from './StockBadge';
import type { CatalogItem } from '@/hooks/use-catalog-search';
import { colors, textStyles, spacing, radius, fonts, fontSize } from '@/theme';

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
  const isOOS = available <= 0 && !hasVariants && !item.isVariablePrice;
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
    const unit = (item as any).sellingUnit;
    const unitLabel = unit && unit !== "piece" ? `/${unit}` : "";
    return <Text style={styles.priceText}>{fmtPrice(item.unitPrice)}{unitLabel}</Text>;
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
      android_ripple={isOOS ? undefined : { color: colors.accent.glow }}
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
        {!item.isVariablePrice && (
          <StockBadge available={available} sellingUnit={(item as any).sellingUnit} />
        )}
      </View>
    </Pressable>
  );
}

export default React.memo(ProductListItem);

const createStyles = () => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 70,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  rowPressed: {
    backgroundColor: colors.accent.glow,
  },
  rowOOS: {
    opacity: 0.58,
  },
  left: {
    flex: 1,
    marginRight: spacing.md,
  },
  right: {
    alignItems: 'flex-end',
    gap: spacing.xs,
    minWidth: 118,
  },
  productName: {
    fontFamily: fonts.display.semiBold,
    fontSize: fontSize.lg,
    color: colors.text.primary,
    lineHeight: 20,
  },
  skuText: {
    ...textStyles.monoSm,
    color: colors.text.muted,
    marginTop: 2,
  },
  priceText: {
    ...textStyles.price,
    color: colors.accent.primary,
  },
  priceNotSet: {
    fontFamily: fonts.display.medium,
    fontSize: fontSize.base,
    color: colors.text.muted,
    fontStyle: 'italic',
  },
  variablePriceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accent.glow,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  variablePriceIcon: {
    fontSize: 12,
    color: colors.accent.primary,
  },
  variablePriceText: {
    fontSize: 12,
    fontFamily: 'Outfit-SemiBold',
    color: colors.accent.primary,
  },
  variantBadge: {
    backgroundColor: colors.accent.glow,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  variantBadgeText: {
    fontSize: 11,
    fontFamily: 'Outfit-SemiBold',
    color: colors.accent.primary,
    letterSpacing: 0,
  },
});
