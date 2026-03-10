/**
 * Spacing and layout tokens — Industrial Premium.
 * All values in dp (device-independent pixels).
 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 48,
} as const;

export const radius = {
  xs: 2,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  pill: 9999,
} as const;

/** Larger touch targets for automotive shop workers (may wear gloves). */
export const touchTarget = {
  min: 52,
} as const;

export const layout = {
  screenPadding: 16,
  headerPaddingTop: 48,
  headerPaddingBottom: 12,
  tabBarHeight: 64,
  tabBarPaddingBottom: 8,
  productRowMinHeight: 60,
  cardGap: 8,
} as const;
