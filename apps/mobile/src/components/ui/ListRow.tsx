import React from 'react';
import { Pressable, StyleSheet, ViewStyle } from 'react-native';
import { colors, layout } from '@/theme';

interface ListRowProps {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  index?: number;
  style?: ViewStyle;
}

function ListRowInner({
  children,
  onPress,
  onLongPress,
  index = 0,
  style,
}: ListRowProps) {
  const isEven = index % 2 === 0;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      android_ripple={{ color: colors.accent.glow }}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: isEven ? colors.bg.primary : colors.bg.surface,
        },
        pressed && styles.pressed,
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

export const ListRow = React.memo(ListRowInner);

const styles = StyleSheet.create({
  base: {
    minHeight: layout.productRowMinHeight,
    paddingHorizontal: layout.screenPadding,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
});
