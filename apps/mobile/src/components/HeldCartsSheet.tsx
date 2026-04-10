import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { getHeldCarts, type HeldCart } from '@/storage/held-carts';
import { useCartStore } from '@/stores/cart-store';
import { colors, spacing, radius, fonts, fontSize } from '@/theme';

interface HeldCartsSheetProps {
  visible: boolean;
  onClose: () => void;
}

function fmtPHP(amount: number): string {
  return `\u20B1${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function HeldCartsSheet({ visible, onClose }: HeldCartsSheetProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  const styles = createStyles();

  // Re-read held carts on every render / refresh
  const heldCarts = visible ? getHeldCarts() : [];

  const refresh = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  const handleResume = useCallback((id: string) => {
    useCartStore.getState().restoreHeldCart(id);
    onClose();
  }, [onClose]);

  const handleDelete = useCallback((cart: HeldCart) => {
    Alert.alert(
      'Delete Held Cart?',
      `Remove "${cart.label}" (${cart.lines.length} items, ${fmtPHP(cart.totalAmount)})?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            useCartStore.getState().deleteHeldCart(cart.id);
            refresh();
          },
        },
      ],
    );
  }, [refresh]);

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Held Carts">
      {heldCarts.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>{'\u23F8'}</Text>
          <Text style={styles.emptyTitle}>No held carts</Text>
          <Text style={styles.emptySubtitle}>
            Hold a cart to park it and serve another customer
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {heldCarts.map((cart) => (
            <View key={cart.id} style={styles.cartRow}>
              <View style={styles.cartInfo}>
                <Text style={styles.cartLabel} numberOfLines={1}>
                  {cart.label}
                </Text>
                <View style={styles.cartMeta}>
                  <Text style={styles.cartMetaText}>
                    {cart.lines.length} item{cart.lines.length !== 1 ? 's' : ''}
                  </Text>
                  <Text style={styles.cartMetaDot}>{'\u00B7'}</Text>
                  <Text style={styles.cartMetaText}>{fmtPHP(cart.totalAmount)}</Text>
                  <Text style={styles.cartMetaDot}>{'\u00B7'}</Text>
                  <Text style={styles.cartMetaText}>{timeAgo(cart.heldAt)}</Text>
                </View>
              </View>
              <View style={styles.cartActions}>
                <Pressable
                  style={styles.resumeButton}
                  onPress={() => handleResume(cart.id)}
                  android_ripple={{ color: 'rgba(0,0,0,0.2)' }}
                >
                  <Text style={styles.resumeText}>Resume</Text>
                </Pressable>
                <Pressable
                  style={styles.deleteButton}
                  onPress={() => handleDelete(cart)}
                  android_ripple={{ color: 'rgba(239,68,68,0.2)' }}
                >
                  <Text style={styles.deleteText}>{'\u2715'}</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}
    </BottomSheet>
  );
}

const createStyles = () =>
  StyleSheet.create({
    list: {
      gap: 8,
      paddingBottom: spacing.lg,
    },
    cartRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.bg.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    cartInfo: {
      flex: 1,
      marginRight: spacing.md,
    },
    cartLabel: {
      fontSize: fontSize.md,
      fontFamily: fonts.display.semiBold,
      color: colors.text.primary,
      marginBottom: 2,
    },
    cartMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    cartMetaText: {
      fontSize: fontSize.xs,
      fontFamily: 'DMSans-Regular',
      color: colors.text.muted,
    },
    cartMetaDot: {
      fontSize: fontSize.xs,
      color: colors.text.muted,
    },
    cartActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    resumeButton: {
      backgroundColor: colors.accent.primary,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: radius.sm,
    },
    resumeText: {
      fontSize: fontSize.sm,
      fontFamily: fonts.display.semiBold,
      color: colors.text.inverse,
    },
    deleteButton: {
      width: 36,
      height: 36,
      borderRadius: radius.sm,
      backgroundColor: colors.status.dangerBg,
      justifyContent: 'center',
      alignItems: 'center',
    },
    deleteText: {
      fontSize: 14,
      fontFamily: fonts.display.semiBold,
      color: colors.status.danger,
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: 32,
    },
    emptyIcon: {
      fontSize: 40,
      marginBottom: 12,
      opacity: 0.3,
    },
    emptyTitle: {
      fontSize: fontSize.md,
      fontFamily: fonts.display.semiBold,
      color: colors.text.muted,
      marginBottom: 4,
    },
    emptySubtitle: {
      fontSize: fontSize.sm,
      fontFamily: 'DMSans-Regular',
      color: colors.text.muted,
      textAlign: 'center',
      lineHeight: 18,
    },
  });
