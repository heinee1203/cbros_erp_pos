/**
 * Slate Dark — Tailwind slate palette with CBROS orange accent.
 *
 * Background tones shifted from pure-black (#0D0D0F) to navy-slate (#0F172A)
 * to match the Base44 reference design. Text tones shifted from warm cream
 * to cool white/slate. Orange accent (#F97316) retained for brand identity.
 *
 * See design-system/base44-tokens.json for extraction source.
 */
export const darkColors = {
  bg: {
    base: '#0F172A',
    primary: '#0F172A',
    surface: '#1E293B',
    elevated: '#334155',
    overlay: '#334155',
    input: '#1E293B',
  },
  border: {
    default: 'rgba(148,163,184,0.15)',
    subtle: 'rgba(148,163,184,0.08)',
    light: 'rgba(148,163,184,0.20)',
    medium: 'rgba(148,163,184,0.25)',
    focus: '#F97316',
  },
  text: {
    primary: '#F8FAFC',
    secondary: '#94A3B8',
    muted: '#64748B',
    inverse: '#0F172A',
  },
  accent: {
    primary: '#F97316',
    pressed: '#EA6B10',
    hover: '#EA6B10',
    glow: 'rgba(249,115,22,0.12)',
    muted: 'rgba(249,115,22,0.06)',
  },
  status: {
    success: '#10B981',
    successBg: 'rgba(16,185,129,0.1)',
    successText: '#10B981',
    warning: '#F59E0B',
    warningBg: 'rgba(245,158,11,0.1)',
    warningText: '#F59E0B',
    danger: '#EF4444',
    dangerBg: 'rgba(239,68,68,0.1)',
    dangerText: '#EF4444',
    info: '#3B82F6',
    infoBg: 'rgba(59,130,246,0.12)',
    infoText: '#3B82F6',
    ok: '#10B981',
    low: '#F59E0B',
    out: '#EF4444',
  },
  stock: {
    ok: '#10B981',
    low: '#F59E0B',
    out: '#EF4444',
  },
  sync: {
    offlineBg: 'rgba(245,158,11,0.15)',
    offlineText: '#F59E0B',
    reconnectBg: 'rgba(59,130,246,0.15)',
    reconnectText: '#3B82F6',
    staleBg: 'rgba(245,158,11,0.10)',
    staleText: '#D4A050',
  },
  shift: {
    bannerBg: '#1E293B',
    bannerBorder: '#334155',
    bannerText: '#F97316',
    bannerBtnBg: '#F97316',
    bannerBtnText: '#FFFFFF',
  },
  toast: {
    successBg: 'rgba(16,185,129,0.95)',
    successText: '#ffffff',
    errorBg: 'rgba(239,68,68,0.95)',
    errorText: '#ffffff',
  },
  tab: {
    active: '#F97316',
    inactive: '#64748B',
    bg: '#0F172A',
    border: '#1E293B',
  },
  transparent: 'transparent',
  white: '#ffffff',
  black: '#000000',
} as const;

/** Shared color palette shape — both themes must match this structure */
type DeepString<T> = { [K in keyof T]: T[K] extends object ? { [J in keyof T[K]]: string } : string };
type ColorPalette = DeepString<typeof darkColors>;

export const lightColors: ColorPalette = {
  bg: {
    base: '#F5F3EF',
    primary: '#F5F3EF',
    surface: '#FFFFFF',
    elevated: '#FFFFFF',
    overlay: '#F0EDE8',
    input: '#FFFFFF',
  },
  border: {
    default: 'rgba(0,0,0,0.08)',
    subtle: 'rgba(0,0,0,0.06)',
    light: 'rgba(0,0,0,0.10)',
    medium: 'rgba(0,0,0,0.16)',
    focus: '#EA580C',
  },
  text: {
    primary: '#1A1A1A',
    secondary: '#6B6560',
    muted: '#A39E96',
    inverse: '#FFFFFF',
  },
  accent: {
    primary: '#EA580C',
    pressed: '#C2410C',
    hover: '#C2410C',
    glow: 'rgba(234,88,12,0.10)',
    muted: 'rgba(234,88,12,0.05)',
  },
  status: {
    success: '#059669',
    successBg: 'rgba(5,150,105,0.08)',
    successText: '#059669',
    warning: '#D97706',
    warningBg: 'rgba(217,119,6,0.08)',
    warningText: '#D97706',
    danger: '#DC2626',
    dangerBg: 'rgba(220,38,38,0.08)',
    dangerText: '#DC2626',
    info: '#2563EB',
    infoBg: 'rgba(37,99,235,0.08)',
    infoText: '#2563EB',
    ok: '#059669',
    low: '#D97706',
    out: '#DC2626',
  },
  stock: {
    ok: '#059669',
    low: '#D97706',
    out: '#DC2626',
  },
  sync: {
    offlineBg: 'rgba(217,119,6,0.12)',
    offlineText: '#D97706',
    reconnectBg: 'rgba(37,99,235,0.12)',
    reconnectText: '#2563EB',
    staleBg: 'rgba(217,119,6,0.08)',
    staleText: '#92400E',
  },
  shift: {
    bannerBg: '#EFF6FF',
    bannerBorder: '#BFDBFE',
    bannerText: '#1E3A8A',
    bannerBtnBg: '#EA580C',
    bannerBtnText: '#FFFFFF',
  },
  toast: {
    successBg: 'rgba(5,150,105,0.95)',
    successText: '#ffffff',
    errorBg: 'rgba(220,38,38,0.95)',
    errorText: '#ffffff',
  },
  tab: {
    active: '#EA580C',
    inactive: '#A39E96',
    bg: '#F5F3EF',
    border: '#E8E4DE',
  },
  transparent: 'transparent',
  white: '#ffffff',
  black: '#000000',
} as const;

// ─── Mutable runtime palette ───
// All files import this same object. ThemeContext mutates it in-place
// so any code that reads colors.bg.primary at render-time gets the active theme.
function deepAssign(target: any, source: any) {
  for (const key of Object.keys(source)) {
    if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
      if (!target[key]) target[key] = {};
      deepAssign(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
}

export const colors: typeof darkColors = JSON.parse(JSON.stringify(darkColors));

/** Called by ThemeContext to swap the runtime palette in-place */
export function _setActiveTheme(isDark: boolean) {
  deepAssign(colors, isDark ? darkColors : lightColors);
}
