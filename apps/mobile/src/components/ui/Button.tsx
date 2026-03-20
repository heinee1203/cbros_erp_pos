import React, { useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { colors, textStyles, spacing, radius, touchTarget } from '@/theme';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

const getVariantStyles = (): Record<
  ButtonVariant,
  { bg: string; text: string; border?: string }
> => ({
  primary: {
    bg: colors.accent.primary,
    text: colors.text.inverse,
  },
  secondary: {
    bg: colors.bg.surface,
    text: colors.text.primary,
    border: colors.border.default,
  },
  danger: {
    bg: colors.status.danger,
    text: colors.white,
  },
  ghost: {
    bg: colors.transparent,
    text: colors.text.secondary,
  },
});

const getPressedBgOverrides = (): Partial<Record<ButtonVariant, string>> => ({
  primary: colors.accent.pressed,
});

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  fullWidth = false,
  icon,
  style,
  textStyle: textStyleOverride,
}: ButtonProps) {
  const styles = createStyles();
  const variantStyles = getVariantStyles();
  const pressedBgOverrides = getPressedBgOverrides();
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

  const vs = variantStyles[variant];

  // Extract layout props (flex, margin, width) for the outer wrapper;
  // visual props stay on the inner Pressable.
  const { flex, flexGrow, flexShrink, flexBasis, margin, marginTop, marginBottom, marginLeft, marginRight, marginHorizontal, marginVertical, alignSelf, width, minWidth, maxWidth, ...innerStyle } = (style ?? {}) as any;
  const outerLayout: ViewStyle = {};
  if (flex != null) outerLayout.flex = flex;
  if (flexGrow != null) outerLayout.flexGrow = flexGrow;
  if (flexShrink != null) outerLayout.flexShrink = flexShrink;
  if (flexBasis != null) outerLayout.flexBasis = flexBasis;
  if (margin != null) outerLayout.margin = margin;
  if (marginTop != null) outerLayout.marginTop = marginTop;
  if (marginBottom != null) outerLayout.marginBottom = marginBottom;
  if (marginLeft != null) outerLayout.marginLeft = marginLeft;
  if (marginRight != null) outerLayout.marginRight = marginRight;
  if (marginHorizontal != null) outerLayout.marginHorizontal = marginHorizontal;
  if (marginVertical != null) outerLayout.marginVertical = marginVertical;
  if (alignSelf != null) outerLayout.alignSelf = alignSelf;
  if (width != null) outerLayout.width = width;
  if (minWidth != null) outerLayout.minWidth = minWidth;
  if (maxWidth != null) outerLayout.maxWidth = maxWidth;

  return (
    <Animated.View
      style={[
        { transform: [{ scale: scaleAnim }] },
        fullWidth && styles.fullWidth,
        outerLayout,
      ]}
    >
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        style={({ pressed }) => [
          styles.base,
          {
            backgroundColor: pressed
              ? pressedBgOverrides[variant] ?? vs.bg
              : vs.bg,
          },
          vs.border ? { borderWidth: 1, borderColor: vs.border } : undefined,
          fullWidth && styles.fullWidth,
          (disabled || loading) && styles.disabled,
          innerStyle,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={vs.text} size="small" />
        ) : (
          <>
            {icon && <>{icon}</>}
            <Text
              style={[
                styles.label,
                { color: vs.text },
                icon ? styles.labelWithIcon : undefined,
                textStyleOverride,
              ]}
              numberOfLines={1}
            >
              {title}
            </Text>
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

const createStyles = () => StyleSheet.create({
  base: {
    minHeight: touchTarget.min,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.4,
  },
  label: {
    ...textStyles.button,
  },
  labelWithIcon: {
    marginLeft: spacing.sm,
  },
});
