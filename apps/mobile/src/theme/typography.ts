/**
 * Typography system — Industrial Premium.
 * Outfit (display), DM Sans (body), JetBrains Mono (data).
 *
 * Font filenames match across Android (TTF filename) and iOS (PostScript name).
 */

const outfit = (weight: string) => `Outfit-${weight}`;
const dmSans = (weight: string) => `DMSans-${weight}`;
const jetBrainsMono = (weight: string) => `JetBrainsMono-${weight}`;

export const fonts = {
  display: {
    regular: outfit('Regular'),
    medium: outfit('Medium'),
    semiBold: outfit('SemiBold'),
    bold: outfit('Bold'),
    extraBold: outfit('ExtraBold'),
  },
  body: {
    regular: dmSans('Regular'),
    medium: dmSans('Medium'),
    semiBold: dmSans('SemiBold'),
  },
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

/** Pre-built text style presets for consistent usage across screens. */
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
