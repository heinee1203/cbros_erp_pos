import React, { useCallback, useRef } from 'react';
import { colors, fonts, fontSize, radius, spacing } from '@/theme';
import {
  Animated,
  Pressable,
  Text,
  StyleSheet,
  ViewStyle,
} from 'react-native';

interface ChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
  count?: number;
  style?: ViewStyle;
}

export function Chip({ label, active, onPress, count, style }: ChipProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  }, [scaleAnim]);

  const displayText = count != null ? `${label} (${count.toLocaleString()})` : label;

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[
          active ? styles.active : styles.inactive,
          style,
        ]}
      >
        <Text
          style={active ? styles.activeText : styles.inactiveText}
          numberOfLines={1}
        >
          {displayText}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  active: {
    backgroundColor: colors.accent.primary,
    borderWidth: 1,
    borderColor: colors.accent.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    marginRight: spacing.sm,
  },
  inactive: {
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.light,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    marginRight: spacing.sm,
  },
  activeText: {
    color: colors.text.inverse,
    fontSize: fontSize.md,
    fontFamily: fonts.display.semiBold,
    letterSpacing: 0,
  },
  inactiveText: {
    color: colors.text.secondary,
    fontSize: fontSize.md,
    fontFamily: fonts.display.medium,
    letterSpacing: 0,
  },
});
