# Industrial Premium Android POS — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the React Native Android POS app from a utilitarian light-theme UI into a best-in-class "Industrial Premium" dark POS with custom fonts, amber accents, micro-interactions, and 3 new features (customer lookup, quick-add favorites, refund flow).

**Architecture:** Phase-based approach — design system foundation first (theme tokens, bundled fonts, reusable components), then restyle all 7 screens, then add 3 new features using the new component system. All changes are mobile-only (apps/mobile/).

**Tech Stack:** React Native 0.79, Zustand 5, MMKV 3, React Navigation 7, React Native Gesture Handler 2.30

---

## Phase 1: Design System Foundation

### Task 1: Bundle Custom Fonts

Download and add 3 font families to the Android project. Use Google Fonts TTF files.

**Files:**
- Create: `apps/mobile/assets/fonts/` directory
- Create: `apps/mobile/assets/fonts/Outfit-Regular.ttf`
- Create: `apps/mobile/assets/fonts/Outfit-Medium.ttf`
- Create: `apps/mobile/assets/fonts/Outfit-SemiBold.ttf`
- Create: `apps/mobile/assets/fonts/Outfit-Bold.ttf`
- Create: `apps/mobile/assets/fonts/Outfit-ExtraBold.ttf`
- Create: `apps/mobile/assets/fonts/DMSans-Regular.ttf`
- Create: `apps/mobile/assets/fonts/DMSans-Medium.ttf`
- Create: `apps/mobile/assets/fonts/DMSans-SemiBold.ttf`
- Create: `apps/mobile/assets/fonts/JetBrainsMono-Regular.ttf`
- Create: `apps/mobile/assets/fonts/JetBrainsMono-Medium.ttf`
- Create: `apps/mobile/assets/fonts/JetBrainsMono-SemiBold.ttf`
- Create: `apps/mobile/react-native.config.js`

**Step 1: Download font files**

Download TTF files from Google Fonts API:
```bash
mkdir -p apps/mobile/assets/fonts
cd apps/mobile/assets/fonts

# Outfit (display/headings)
curl -L "https://fonts.google.com/download?family=Outfit" -o outfit.zip && unzip -o outfit.zip -d outfit_tmp
cp outfit_tmp/static/Outfit-Regular.ttf .
cp outfit_tmp/static/Outfit-Medium.ttf .
cp outfit_tmp/static/Outfit-SemiBold.ttf .
cp outfit_tmp/static/Outfit-Bold.ttf .
cp outfit_tmp/static/Outfit-ExtraBold.ttf .
rm -rf outfit.zip outfit_tmp

# DM Sans (body/UI)
curl -L "https://fonts.google.com/download?family=DM+Sans" -o dmsans.zip && unzip -o dmsans.zip -d dmsans_tmp
cp dmsans_tmp/static/DMSans-Regular.ttf .
cp dmsans_tmp/static/DMSans-Medium.ttf .
cp dmsans_tmp/static/DMSans-SemiBold.ttf .
rm -rf dmsans.zip dmsans_tmp

# JetBrains Mono (monospace/data)
curl -L "https://fonts.google.com/download?family=JetBrains+Mono" -o jbmono.zip && unzip -o jbmono.zip -d jbmono_tmp
cp jbmono_tmp/static/JetBrainsMono-Regular.ttf .
cp jbmono_tmp/static/JetBrainsMono-Medium.ttf .
cp jbmono_tmp/static/JetBrainsMono-SemiBold.ttf .
rm -rf jbmono.zip jbmono_tmp
```

**Step 2: Create react-native.config.js**

```javascript
// apps/mobile/react-native.config.js
module.exports = {
  project: {
    android: {},
  },
  assets: ['./assets/fonts'],
};
```

**Step 3: Link font assets to Android**

```bash
cd apps/mobile
npx react-native-asset
```

This copies fonts to `android/app/src/main/assets/fonts/` automatically.

**Step 4: Verify fonts are in Android assets**

```bash
ls apps/mobile/android/app/src/main/assets/fonts/
```

Expected: All 11 TTF files listed.

**Step 5: Commit**

```bash
git add apps/mobile/assets/fonts/ apps/mobile/react-native.config.js apps/mobile/android/app/src/main/assets/fonts/
git commit -m "feat(mobile): bundle Outfit, DM Sans, JetBrains Mono fonts"
```

---

### Task 2: Rewrite Theme — Colors

Replace the light-mode color palette with Dark Forge tokens.

**Files:**
- Modify: `apps/mobile/src/theme/colors.ts`

**Step 1: Replace colors.ts entirely**

```typescript
// apps/mobile/src/theme/colors.ts

export const colors = {
  // Backgrounds (dark-dominant)
  bg: {
    primary: '#0C0C12',
    surface: '#16161F',
    elevated: '#1E1E2A',
    input: '#12121A',
  },

  // Borders
  border: {
    default: '#2A2A3A',
    focus: '#FF8A00',
    subtle: '#1E1E2A',
  },

  // Text
  text: {
    primary: '#F0F0F5',
    secondary: '#8B8B9E',
    muted: '#5A5A6E',
    inverse: '#0C0C12',
  },

  // Accent
  accent: {
    primary: '#FF8A00',
    glow: 'rgba(255,138,0,0.15)',
    pressed: '#E07800',
  },

  // Status
  status: {
    success: '#00C853',
    successBg: 'rgba(0,200,83,0.12)',
    successText: '#00C853',
    warning: '#FFB300',
    warningBg: 'rgba(255,179,0,0.12)',
    warningText: '#FFB300',
    danger: '#FF3D3D',
    dangerBg: 'rgba(255,61,61,0.12)',
    dangerText: '#FF3D3D',
    info: '#00B8FF',
    infoBg: 'rgba(0,184,255,0.12)',
    infoText: '#00B8FF',
  },

  // Inventory stock
  stock: {
    ok: '#00C853',
    low: '#FFB300',
    out: '#FF3D3D',
  },

  // Sync bar states
  sync: {
    offlineBg: 'rgba(255,179,0,0.12)',
    offlineText: '#FFB300',
    reconnectBg: 'rgba(0,184,255,0.12)',
    reconnectText: '#00B8FF',
    staleBg: 'rgba(90,90,110,0.12)',
    staleText: '#5A5A6E',
  },

  // Toast
  toast: {
    successBg: 'rgba(0,200,83,0.95)',
    successText: '#ffffff',
    errorBg: 'rgba(255,61,61,0.95)',
    errorText: '#ffffff',
  },

  // Tab bar
  tab: {
    active: '#FF8A00',
    inactive: '#5A5A6E',
    bg: '#0C0C12',
    border: '#1E1E2A',
  },

  // Transparent
  transparent: 'transparent',
  white: '#ffffff',
  black: '#000000',
} as const;
```

**Step 2: Verify no TypeScript errors**

```bash
cd apps/mobile && npx tsc --noEmit 2>&1 | head -30
```

Fix any import issues in files that reference old color tokens (e.g., `colors.primary` → `colors.bg.primary`).

**Step 3: Commit**

```bash
git add apps/mobile/src/theme/colors.ts
git commit -m "feat(mobile): replace color palette with Dark Forge tokens"
```

---

### Task 3: Rewrite Theme — Typography

Replace system fonts with bundled custom font references.

**Files:**
- Modify: `apps/mobile/src/theme/typography.ts`

**Step 1: Replace typography.ts entirely**

```typescript
// apps/mobile/src/theme/typography.ts
import { Platform } from 'react-native';

// Android uses exact filename (minus .ttf), iOS uses PostScript name
const outfit = (weight: string) =>
  Platform.OS === 'android' ? `Outfit-${weight}` : `Outfit-${weight}`;
const dmSans = (weight: string) =>
  Platform.OS === 'android' ? `DMSans-${weight}` : `DMSans-${weight}`;
const jetBrainsMono = (weight: string) =>
  Platform.OS === 'android' ? `JetBrainsMono-${weight}` : `JetBrainsMono-${weight}`;

export const fonts = {
  // Display / Headings
  display: {
    regular: outfit('Regular'),
    medium: outfit('Medium'),
    semiBold: outfit('SemiBold'),
    bold: outfit('Bold'),
    extraBold: outfit('ExtraBold'),
  },
  // Body / UI
  body: {
    regular: dmSans('Regular'),
    medium: dmSans('Medium'),
    semiBold: dmSans('SemiBold'),
  },
  // Monospace / Data
  mono: {
    regular: jetBrainsMono('Regular'),
    medium: jetBrainsMono('Medium'),
    semiBold: jetBrainsMono('SemiBold'),
  },
} as const;

export const fontSize = {
  xs: 11,
  sm: 12,
  md: 13,
  base: 14,
  lg: 15,
  xl: 16,
  '2xl': 18,
  '3xl': 20,
  '4xl': 24,
  '5xl': 28,
  '6xl': 32,
  '7xl': 36,
} as const;

// Prebuilt text style presets
export const textStyles = {
  display: { fontFamily: fonts.display.extraBold, fontSize: fontSize['5xl'] },
  heading: { fontFamily: fonts.display.bold, fontSize: fontSize['3xl'] },
  subheading: { fontFamily: fonts.display.semiBold, fontSize: fontSize.xl },
  body: { fontFamily: fonts.body.regular, fontSize: fontSize.lg },
  bodyMedium: { fontFamily: fonts.body.medium, fontSize: fontSize.lg },
  caption: { fontFamily: fonts.body.medium, fontSize: fontSize.md },
  captionSmall: { fontFamily: fonts.body.regular, fontSize: fontSize.sm },
  monoLg: { fontFamily: fonts.mono.semiBold, fontSize: fontSize['2xl'] },
  monoMd: { fontFamily: fonts.mono.medium, fontSize: fontSize.base },
  monoSm: { fontFamily: fonts.mono.regular, fontSize: fontSize.sm },
  button: { fontFamily: fonts.display.bold, fontSize: fontSize.lg },
  tabLabel: { fontFamily: fonts.body.semiBold, fontSize: fontSize.sm },
} as const;

export const lineHeight = {
  tight: 1.2,
  normal: 1.4,
  relaxed: 1.6,
} as const;
```

**Step 2: Verify no TypeScript errors**

```bash
cd apps/mobile && npx tsc --noEmit 2>&1 | head -30
```

**Step 3: Commit**

```bash
git add apps/mobile/src/theme/typography.ts
git commit -m "feat(mobile): add typography system with Outfit/DM Sans/JetBrains Mono"
```

---

### Task 4: Update Theme — Spacing + Barrel Export

**Files:**
- Modify: `apps/mobile/src/theme/spacing.ts`
- Modify: `apps/mobile/src/theme/index.ts`

**Step 1: Update spacing.ts with new tokens**

```typescript
// apps/mobile/src/theme/spacing.ts

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

export const touchTarget = {
  min: 52, // Larger for gloved automotive workers
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
```

**Step 2: Update barrel export**

```typescript
// apps/mobile/src/theme/index.ts
export { colors } from './colors';
export { fonts, fontSize, textStyles, lineHeight } from './typography';
export { spacing, radius, touchTarget, layout } from './spacing';
```

**Step 3: Commit**

```bash
git add apps/mobile/src/theme/
git commit -m "feat(mobile): complete Dark Forge design system tokens"
```

---

### Task 5: Create Reusable UI Components

Build the core component library used by all screens.

**Files:**
- Create: `apps/mobile/src/components/ui/Button.tsx`
- Create: `apps/mobile/src/components/ui/IconButton.tsx`
- Create: `apps/mobile/src/components/ui/Card.tsx`
- Create: `apps/mobile/src/components/ui/Input.tsx`
- Create: `apps/mobile/src/components/ui/Badge.tsx`
- Create: `apps/mobile/src/components/ui/Chip.tsx`
- Create: `apps/mobile/src/components/ui/BottomSheet.tsx`
- Create: `apps/mobile/src/components/ui/Toast.tsx`
- Create: `apps/mobile/src/components/ui/Skeleton.tsx`
- Create: `apps/mobile/src/components/ui/ListRow.tsx`
- Create: `apps/mobile/src/components/ui/Divider.tsx`
- Create: `apps/mobile/src/components/ui/index.ts`

**Step 1: Create Button component**

```typescript
// apps/mobile/src/components/ui/Button.tsx
import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { colors } from '@/theme/colors';
import { textStyles } from '@/theme/typography';
import { radius, touchTarget } from '@/theme/spacing';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

const VARIANT_STYLES: Record<ButtonVariant, { bg: string; text: string; border?: string }> = {
  primary: { bg: colors.accent.primary, text: colors.text.inverse },
  secondary: { bg: colors.bg.surface, text: colors.text.primary, border: colors.border.default },
  danger: { bg: colors.status.danger, text: colors.white },
  ghost: { bg: 'transparent', text: colors.text.secondary },
};

export function Button({
  title, onPress, variant = 'primary', disabled, loading, fullWidth, style, textStyle,
}: ButtonProps) {
  const v = VARIANT_STYLES[variant];

  const handlePress = () => {
    try { ReactNativeHapticFeedback.trigger('impactLight'); } catch {}
    onPress();
  };

  return (
    <TouchableOpacity
      style={[
        styles.base,
        { backgroundColor: v.bg },
        v.border ? { borderWidth: 1, borderColor: v.border } : undefined,
        fullWidth && styles.fullWidth,
        disabled && styles.disabled,
        style,
      ]}
      onPress={handlePress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color={v.text} size="small" />
      ) : (
        <Text style={[styles.text, { color: v.text }, textStyle]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget.min,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  fullWidth: { width: '100%' },
  disabled: { opacity: 0.4 },
  text: { ...textStyles.button },
});
```

NOTE: If `react-native-haptic-feedback` is not installed, install it:
```bash
cd apps/mobile && pnpm add react-native-haptic-feedback
```
If haptic feedback causes issues on the emulator, wrap in try/catch (already done above).

**Step 2: Create remaining UI components**

Create each component following the same pattern:
- Dark backgrounds from `colors.bg.*`
- Amber accents from `colors.accent.*`
- Custom fonts from `textStyles.*`
- 52px minimum touch targets
- Haptic feedback on interactive elements

Each component should be self-contained with StyleSheet.create at the bottom.

**Card.tsx:**
```typescript
// Dark surface card with subtle border
// Props: children, elevated?, style?
// Styles: bg.surface, border.default 1px, radius.sm (2px)
// Elevated variant: bg.elevated
```

**Input.tsx:**
```typescript
// Dark input with amber focus ring
// Props: value, onChangeText, placeholder, leftIcon?, secureTextEntry?
// Styles: bg.input, border.default 1px, on focus: border.focus (amber)
// Font: fonts.body.regular, fontSize.lg
// Min height: touchTarget.min (52px)
```

**Badge.tsx:**
```typescript
// Status badge with subtle glow
// Props: label, variant (success|warning|danger|info)
// Styles: colored bg (12% opacity) + colored text
// Font: textStyles.captionSmall, uppercase
```

**Chip.tsx:**
```typescript
// Filter/toggle chip
// Props: label, active, onPress
// Active: bg accent.primary, text inverse
// Inactive: bg bg.surface, text text.secondary, border border.default
```

**BottomSheet.tsx:**
```typescript
// Bottom sheet modal with drag handle
// Props: visible, onClose, children, height?
// Uses React Native Modal with slide animation
// Dark elevated background, drag handle bar at top
```

**Toast.tsx:**
```typescript
// Top notification slide-in
// Props: message, variant (success|error|info), visible, onDismiss
// Animated.View with spring translateY
// Auto-dismiss after 2 seconds
```

**Skeleton.tsx:**
```typescript
// Loading placeholder with dark shimmer
// Props: width, height, style
// Animated opacity pulse (0.3 → 0.7 → 0.3) on bg.surface
```

**ListRow.tsx:**
```typescript
// Pressable row with subtle feedback
// Props: children, onPress, onLongPress?, alternateIndex?
// Even rows: bg.primary (#0C0C12)
// Odd rows: bg.surface (#16161F)
// Press state: slightly lighter bg
```

**Divider.tsx:**
```typescript
// Simple hairline divider
// Props: style?
// 1px height, border.default color
```

**IconButton.tsx:**
```typescript
// Circle/square icon button
// Props: icon (React element), onPress, variant?, size?
// Haptic on press, 44px default size
```

**index.ts (barrel export):**
```typescript
export { Button } from './Button';
export { IconButton } from './IconButton';
export { Card } from './Card';
export { Input } from './Input';
export { Badge } from './Badge';
export { Chip } from './Chip';
export { BottomSheet } from './BottomSheet';
export { Toast } from './Toast';
export { Skeleton } from './Skeleton';
export { ListRow } from './ListRow';
export { Divider } from './Divider';
```

**Step 3: Verify TypeScript compilation**

```bash
cd apps/mobile && npx tsc --noEmit 2>&1 | head -40
```

**Step 4: Commit**

```bash
git add apps/mobile/src/components/ui/
git commit -m "feat(mobile): add Industrial Premium component library"
```

---

## Phase 2: Screen Redesigns

### Task 6: Restyle Bottom Tab Bar

**Files:**
- Modify: `apps/mobile/src/app/MainTabs.tsx`

**Step 1: Update tab bar styling**

Replace the current light tab bar with:
```typescript
tabBarStyle: {
  backgroundColor: colors.bg.primary,    // #0C0C12
  borderTopColor: colors.border.subtle,  // #1E1E2A
  borderTopWidth: 1,
  height: layout.tabBarHeight,           // 64
  paddingBottom: layout.tabBarPaddingBottom,
},
tabBarActiveTintColor: colors.tab.active,   // #FF8A00 (amber)
tabBarInactiveTintColor: colors.tab.inactive, // #5A5A6E
tabBarLabelStyle: { ...textStyles.tabLabel },
```

**Step 2: Verify on emulator**

```bash
adb shell uiautomator dump /dev/tty
```

Look for tab bar elements with correct labels (POS, Transactions, Settings).

**Step 3: Commit**

```bash
git add apps/mobile/src/app/MainTabs.tsx
git commit -m "feat(mobile): restyle tab bar with dark theme and amber accents"
```

---

### Task 7: Redesign CatalogScreen

The most critical screen — product browsing and search.

**Files:**
- Modify: `apps/mobile/src/app/screens/CatalogScreen.tsx`
- Modify: `apps/mobile/src/components/ProductListItem.tsx`
- Modify: `apps/mobile/src/components/StockBadge.tsx`
- Modify: `apps/mobile/src/components/SyncStatusBar.tsx`

**Step 1: Update CatalogScreen colors and fonts**

Replace ALL StyleSheet colors:
- `backgroundColor: '#fff'` → `colors.bg.primary`
- Header `backgroundColor: '#111318'` → `colors.bg.primary` (same dark, but using token)
- Header text → `textStyles.heading` + `colors.text.primary`
- Search input → `colors.bg.input` bg, `colors.border.default` border, `colors.border.focus` on focus
- Category chips → Use `Chip` component from ui library
- Cart button → amber badge with `colors.accent.primary`

Replace ALL font references:
- Heading → `textStyles.heading`
- Search → `textStyles.body`
- Chip text → `textStyles.caption`

**Step 2: Add alternating row backgrounds to FlatList**

In FlatList `renderItem`, pass index to ProductListItem:
```typescript
renderItem={({ item, index }) => (
  <ProductListItem product={item} index={index} onAdd={handleAdd} />
)}
```

**Step 3: Update ProductListItem for dark theme**

```typescript
// Even rows: colors.bg.primary, odd rows: colors.bg.surface
const rowBg = index % 2 === 0 ? colors.bg.primary : colors.bg.surface;

// Mnemonic SKU: textStyles.monoMd + colors.text.primary
// Product name: textStyles.caption + colors.text.secondary
// Price: textStyles.monoMd + colors.accent.primary (amber for prices!)
// Stock count: textStyles.captionSmall + stock color
```

**Step 4: Update StockBadge colors**

```typescript
colors.stock.ok    // #00C853
colors.stock.low   // #FFB300
colors.stock.out   // #FF3D3D
```

**Step 5: Update SyncStatusBar for dark theme**

```typescript
// Offline: colors.sync.offlineBg + colors.sync.offlineText
// Reconnecting: colors.sync.reconnectBg + colors.sync.reconnectText
// Stale: colors.sync.staleBg + colors.sync.staleText
// Font: textStyles.captionSmall
```

**Step 6: Update toast to use dark theme Toast component**

Replace inline Animated.View toast with the `Toast` component from ui library.

**Step 7: Verify on emulator**

```bash
adb shell uiautomator dump /dev/tty
```

Confirm catalog shows products, search works, categories filter correctly.

**Step 8: Commit**

```bash
git add apps/mobile/src/app/screens/CatalogScreen.tsx apps/mobile/src/components/
git commit -m "feat(mobile): redesign catalog screen with Dark Forge theme"
```

---

### Task 8: Redesign CartScreen

**Files:**
- Modify: `apps/mobile/src/app/screens/CartScreen.tsx`

**Step 1: Update cart to dark theme with card-based line items**

Key changes:
- Background: `colors.bg.primary`
- Header: same dark, with `textStyles.heading`
- Line items: wrapped in `Card` component (dark surface)
- Quantity buttons: amber accent for +/−
- Grand total: `textStyles.monoLg` + `colors.accent.primary` (amber)
- CHARGE button: `Button` component, `variant="primary"` (amber), fullWidth
- Payment chips: Use `Chip` component with all methods: Cash, Card, QRPH, GCash, Maya
- Cash change: `colors.status.success` green in mono font
- Customer bar: dark card with amber left border

**Step 2: Expand payment method options**

Update the payment method section to show all options:
```typescript
const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'CARD', label: 'Card' },
  { value: 'QRPH', label: 'QRPH' },
  { value: 'GCASH', label: 'GCash' },
  { value: 'MAYA', label: 'Maya' },
] as const;
```

Update cart store's `paymentMethod` type to accept these values.

**Step 3: Update success and pending states**

- Success: dark bg, large green checkmark, receipt number in mono, total in amber
- Pending: dark bg, amber hourglass, message in secondary text

**Step 4: Verify checkout flow on emulator**

Add a product, go to cart, verify layout. Don't need to actually charge.

```bash
adb shell uiautomator dump /dev/tty
```

**Step 5: Commit**

```bash
git add apps/mobile/src/app/screens/CartScreen.tsx apps/mobile/src/stores/cart-store.ts
git commit -m "feat(mobile): redesign cart screen with dark cards and amber CTA"
```

---

### Task 9: Redesign Transaction Screens

**Files:**
- Modify: `apps/mobile/src/app/screens/TransactionListScreen.tsx`
- Modify: `apps/mobile/src/app/screens/TransactionDetailScreen.tsx`

**Step 1: Update TransactionListScreen**

- Background: `colors.bg.primary`
- Header: dark, `textStyles.heading`
- Transaction rows: alternating bg, receipt number in `textStyles.monoMd`, time in `textStyles.captionSmall`
- Status badges: use `Badge` component (success/danger variants)
- Grand total: `textStyles.monoMd` + `colors.text.primary`
- Pending banner: amber bg with `colors.sync.offlineBg`
- Empty state: muted text, centered

**Step 2: Update TransactionDetailScreen**

- Background: `colors.bg.primary`
- Sections in `Card` components (dark surface)
- Sale header: receipt number in `textStyles.monoMd`, status badge
- Customer section: name + vehicle info (if linked)
- Items: each line in a row with product name, qty, unit price, total
- Totals: mono font, grand total in amber
- Payment: method label + amount

**Step 3: Verify on emulator**

```bash
adb shell uiautomator dump /dev/tty
```

**Step 4: Commit**

```bash
git add apps/mobile/src/app/screens/Transaction*.tsx
git commit -m "feat(mobile): redesign transaction screens with dark theme"
```

---

### Task 10: Redesign Settings & Auth Screens

**Files:**
- Modify: `apps/mobile/src/app/screens/SettingsScreen.tsx`
- Modify: `apps/mobile/src/app/screens/PrinterSetupScreen.tsx`
- Modify: `apps/mobile/src/app/screens/LoginScreen.tsx`
- Modify: `apps/mobile/src/app/screens/ServerConfigScreen.tsx`

**Step 1: Update SettingsScreen**

- Background: `colors.bg.primary`
- Section cards: `Card` component, section labels in `textStyles.caption` + amber
- Row values: `textStyles.body` + `colors.text.primary`
- Buttons: `Button` component (Sync Now = secondary, Reconcile = primary, Sign Out = danger)
- Amber glow on "Reconcile Now" when pending > 0

**Step 2: Update PrinterSetupScreen**

- Dark theme, device list in dark cards
- Connected state: green dot, Test Print and Disconnect buttons
- Scanning: amber spinner

**Step 3: Update LoginScreen**

- Full dark background
- "APEX" title in `textStyles.display` + `colors.accent.primary` (amber)
- Input fields: use `Input` component
- Sign In button: `Button` variant="primary"

**Step 4: Update ServerConfigScreen**

- Same dark theme, `Input` component for URL entry
- Continue button: `Button` variant="primary"

**Step 5: Commit**

```bash
git add apps/mobile/src/app/screens/SettingsScreen.tsx apps/mobile/src/app/screens/PrinterSetupScreen.tsx apps/mobile/src/app/screens/LoginScreen.tsx apps/mobile/src/app/screens/ServerConfigScreen.tsx
git commit -m "feat(mobile): redesign settings, auth screens with dark theme"
```

---

## Phase 3: New Features

### Task 11: Quick-Add Favorites

**Files:**
- Create: `apps/mobile/src/storage/favorites.ts`
- Modify: `apps/mobile/src/app/screens/CatalogScreen.tsx`
- Create: `apps/mobile/src/components/FavoritesGrid.tsx`
- Create: `apps/mobile/src/components/FavoriteTile.tsx`

**Step 1: Create favorites storage (MMKV)**

```typescript
// apps/mobile/src/storage/favorites.ts
import { storage, getJSON, setJSON } from './mmkv';

const KEY = 'favorites.productIds';

export function getFavoriteIds(): string[] {
  return getJSON<string[]>(storage, KEY) ?? [];
}

export function addFavorite(productId: string): void {
  const ids = getFavoriteIds();
  if (!ids.includes(productId)) {
    ids.push(productId);
    setJSON(storage, KEY, ids);
  }
}

export function removeFavorite(productId: string): void {
  const ids = getFavoriteIds().filter(id => id !== productId);
  setJSON(storage, KEY, ids);
}

export function isFavorite(productId: string): boolean {
  return getFavoriteIds().includes(productId);
}
```

**Step 2: Create FavoriteTile component**

```typescript
// apps/mobile/src/components/FavoriteTile.tsx
// Dark card with amber left-accent bar
// Shows: short product name (truncated), price (mono), stock dot + count
// Tap: add to cart + haptic
// Long-press: remove from favorites (with confirmation)
// Size: ~33% width (3 columns)
```

**Step 3: Create FavoritesGrid component**

```typescript
// apps/mobile/src/components/FavoritesGrid.tsx
// 3x2 grid of FavoriteTile components
// Collapsible with chevron toggle
// Collapsed state stored in MMKV
// Only shows if favorites exist
// Header: "Quick Add" with star icon
```

**Step 4: Integrate into CatalogScreen**

- Add "Favs" as first filter chip
- Insert FavoritesGrid above FlatList (when not collapsed)
- Add long-press handler on ProductListItem: "Add to Favorites" option
- When "Favs" chip is active, filter FlatList to only favorited products

**Step 5: Verify favorites work**

- Long-press a product → should show add option
- Favorites grid should appear at top
- Tap tile → product added to cart
- Long-press tile → remove option

```bash
adb shell uiautomator dump /dev/tty
```

**Step 6: Commit**

```bash
git add apps/mobile/src/storage/favorites.ts apps/mobile/src/components/Favorite*.tsx apps/mobile/src/app/screens/CatalogScreen.tsx
git commit -m "feat(mobile): add quick-add favorites grid to catalog"
```

---

### Task 12: Customer Lookup Bottom Sheet

**Files:**
- Create: `apps/mobile/src/components/CustomerLookup.tsx`
- Create: `apps/mobile/src/hooks/use-customer-search.ts`
- Modify: `apps/mobile/src/app/screens/CartScreen.tsx`

**Step 1: Create customer search hook**

```typescript
// apps/mobile/src/hooks/use-customer-search.ts
import { useState, useCallback } from 'react';
import { apiFetch } from '@/services/api-client';

interface Customer {
  id: string;
  name: string;
  phone: string;
}

interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number | null;
  plateNo: string | null;
}

export function useCustomerSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Record<string, Vehicle[]>>({});
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (q: string) => {
    setQuery(q);
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const data = await apiFetch<{ customers: Customer[] }>(
        `/customers/search?q=${encodeURIComponent(q)}`
      );
      setResults(data.customers);
    } catch { setResults([]); }
    setLoading(false);
  }, []);

  const fetchVehicles = useCallback(async (customerId: string) => {
    if (vehicles[customerId]) return vehicles[customerId];
    try {
      const data = await apiFetch<{ vehicles: Vehicle[] }>(
        `/customers/${customerId}/vehicles`
      );
      setVehicles(prev => ({ ...prev, [customerId]: data.vehicles }));
      return data.vehicles;
    } catch { return []; }
  }, [vehicles]);

  return { query, results, loading, search, fetchVehicles, vehicles };
}
```

**Step 2: Create CustomerLookup bottom sheet**

```typescript
// apps/mobile/src/components/CustomerLookup.tsx
// Uses BottomSheet component from ui library
// Search input at top
// Results list: customer name, phone, primary vehicle (if any)
// Tap customer → select, fetch vehicles if needed
// If multiple vehicles → show vehicle picker
// "New Customer" button at bottom → inline form (name + phone + optional vehicle)
// On select: calls cart.attachCustomer(customerId, name, vehicleId?)
```

**Step 3: Integrate into CartScreen**

- Add "Add Customer" button in cart header (when no customer attached)
- When customer attached: show customer bar with name, vehicle, plate
- Tap customer bar → reopen lookup to change
- X button on customer bar → detach customer

**Step 4: Verify customer lookup**

```bash
# Check API is serving customer data
adb shell "curl -s http://10.0.2.2:3000/customers/search?q=test" 2>&1 | head -5
```

```bash
adb shell uiautomator dump /dev/tty
```

**Step 5: Commit**

```bash
git add apps/mobile/src/components/CustomerLookup.tsx apps/mobile/src/hooks/use-customer-search.ts apps/mobile/src/app/screens/CartScreen.tsx
git commit -m "feat(mobile): add customer lookup with vehicle selection"
```

---

### Task 13: Refund Flow

**Files:**
- Create: `apps/mobile/src/components/PinPad.tsx`
- Create: `apps/mobile/src/components/RefundFlow.tsx`
- Modify: `apps/mobile/src/app/screens/TransactionDetailScreen.tsx`
- Modify: `apps/mobile/src/app/MainTabs.tsx` (add refund screen to Transactions stack if needed)

**Step 1: Create PinPad component**

```typescript
// apps/mobile/src/components/PinPad.tsx
// Full-screen overlay with 4-digit PIN entry
// Dark bg with amber number buttons (3x4 grid + backspace + confirm)
// Shows 4 circles: filled as digits are entered
// On 4th digit: auto-submit
// Calls: POST /auth/verify-pin with { pin }
// On success: resolves promise
// On failure: shake animation, clear PIN, show error
// Uses haptic feedback on each key press
```

**Step 2: Create RefundFlow component**

```typescript
// apps/mobile/src/components/RefundFlow.tsx
// Multi-step refund wizard (bottom sheet or full screen):
//
// Step 1: Select items
//   - Checkboxes next to each sale line item (all selected by default)
//   - Quantity adjuster for partial refunds (1 to original qty)
//   - Running refund total at bottom
//
// Step 2: Select reason
//   - Preset chips: "Defective", "Wrong Part", "Customer Changed Mind", "Other"
//   - If "Other" → text input for custom reason
//
// Step 3: Confirmation
//   - Summary: items being refunded, quantities, refund total (red, large)
//   - "Confirm Refund" button (danger variant)
//   - "Cancel" button (ghost variant)
//
// On confirm: POST /sales/:id/refund with { lines, reason, idempotencyKey }
// On success: navigate back to transaction detail, show updated status
```

**Step 3: Integrate into TransactionDetailScreen**

- Add "Refund" button at bottom (only for COMPLETED sales)
- Button variant: danger (red)
- On press: show PinPad overlay
- After PIN verified: open RefundFlow
- After refund success: refresh sale data, show REFUNDED badge

**Step 4: Verify refund flow**

First complete a test sale, then:
```bash
adb shell uiautomator dump /dev/tty
```

Confirm "Refund" button appears on completed sale detail.

**Step 5: Commit**

```bash
git add apps/mobile/src/components/PinPad.tsx apps/mobile/src/components/RefundFlow.tsx apps/mobile/src/app/screens/TransactionDetailScreen.tsx
git commit -m "feat(mobile): add manager-authorized refund flow with PIN verification"
```

---

## Phase 4: Polish & Micro-interactions

### Task 14: Add Micro-interactions

**Files:**
- Modify: `apps/mobile/src/components/ui/Button.tsx` (scale animation)
- Modify: `apps/mobile/src/components/ProductListItem.tsx` (press feedback)
- Modify: `apps/mobile/src/app/MainTabs.tsx` (tab indicator animation)
- Modify: `apps/mobile/src/app/screens/CartScreen.tsx` (quantity roll animation)

**Step 1: Add button press scale animation**

```typescript
// In Button.tsx: wrap TouchableOpacity with Animated.View
// On press-in: Animated.spring to scale 0.97
// On press-out: Animated.spring back to 1.0
// Use useNativeDriver: true
```

**Step 2: Add list row press ripple**

```typescript
// In ProductListItem.tsx: use Pressable with android_ripple
// rippleColor: colors.accent.glow
```

**Step 3: Add custom pull-to-refresh spinner**

```typescript
// In CatalogScreen RefreshControl:
// tintColor: colors.accent.primary (amber spinner)
// colors: [colors.accent.primary] (Android)
// progressBackgroundColor: colors.bg.surface
```

**Step 4: Commit**

```bash
git add apps/mobile/src/components/ apps/mobile/src/app/
git commit -m "feat(mobile): add micro-interactions (haptic, ripple, animations)"
```

---

### Task 15: Loading Skeletons

**Files:**
- Modify: `apps/mobile/src/app/screens/CatalogScreen.tsx`
- Modify: `apps/mobile/src/app/screens/TransactionListScreen.tsx`
- Modify: `apps/mobile/src/app/screens/TransactionDetailScreen.tsx`

**Step 1: Add skeleton rows during loading**

```typescript
// In CatalogScreen: show 8 Skeleton rows while catalog is loading
// Each skeleton: 60px height, 2 bars (short + long)
// Dark shimmer animation

// In TransactionListScreen: show 5 Skeleton rows while fetching
// In TransactionDetailScreen: show card-shaped skeletons
```

**Step 2: Commit**

```bash
git add apps/mobile/src/app/screens/
git commit -m "feat(mobile): add loading skeleton placeholders"
```

---

### Task 16: Final Integration Test

**Step 1: Rebuild and verify on emulator**

```bash
cd apps/mobile
npx react-native run-android
```

**Step 2: Verify all screens**

Use uiautomator dumps and logcat to verify:
- [ ] Login screen: dark theme, custom fonts
- [ ] Catalog: dark bg, favorites grid, category chips, product list
- [ ] Cart: dark cards, payment methods, amber CHARGE button
- [ ] Customer lookup: bottom sheet search
- [ ] Checkout: success/pending states
- [ ] Transactions: dark list, status badges
- [ ] Transaction detail: refund button on completed sales
- [ ] Settings: dark cards, amber accents
- [ ] Offline mode: sync bar styles correct

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat(mobile): Industrial Premium POS redesign complete"
```

---

## Summary

| Phase | Tasks | Key Deliverables |
|-------|-------|-----------------|
| 1: Design System | Tasks 1-5 | Fonts, colors, typography, 11 UI components |
| 2: Screens | Tasks 6-10 | All 7 screens restyled dark with amber |
| 3: Features | Tasks 11-13 | Favorites, customer lookup, refund flow |
| 4: Polish | Tasks 14-16 | Animations, skeletons, integration test |

**Total: 16 tasks, ~13 commits**

**Dependencies / External:**
- Google Fonts TTF files (free, OFL license)
- `react-native-haptic-feedback` package (optional, graceful fallback)
- API already has customer, vehicle, and refund endpoints — no backend changes needed
