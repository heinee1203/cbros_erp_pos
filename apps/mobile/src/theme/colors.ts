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

/**
 * Light mode — Tailwind slate palette, cohesive with the dark slate theme.
 * Shifted from the old warm-toned (#F5F3EF / #6B6560) to cool slate tones
 * so toggling dark ↔ light feels like the same design system, not two
 * different apps. Orange accent stays consistent across both modes.
 */
export const lightColors: ColorPalette = {
  bg: {
    base: '#F8FAFC',       // slate-50
    primary: '#F8FAFC',
    surface: '#FFFFFF',     // white cards
    elevated: '#F1F5F9',   // slate-100 (modals, dropdowns)
    overlay: '#E2E8F0',    // slate-200
    input: '#F1F5F9',      // slate-100 (input fields)
  },
  border: {
    default: 'rgba(15,23,42,0.10)',   // slate-900 at 10%
    subtle: 'rgba(15,23,42,0.06)',
    light: 'rgba(15,23,42,0.12)',
    medium: 'rgba(15,23,42,0.18)',
    focus: '#F97316',                  // orange focus ring
  },
  text: {
    primary: '#0F172A',    // slate-900
    secondary: '#475569',  // slate-600
    muted: '#94A3B8',      // slate-400
    inverse: '#F8FAFC',    // slate-50 (text on dark surfaces)
  },
  accent: {
    primary: '#F97316',    // same orange as dark mode
    pressed: '#EA6B10',
    hover: '#EA6B10',
    glow: 'rgba(249,115,22,0.12)',
    muted: 'rgba(249,115,22,0.06)',
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
    bannerBtnBg: '#F97316',        // orange (was #EA580C)
    bannerBtnText: '#FFFFFF',
  },
  toast: {
    successBg: 'rgba(5,150,105,0.95)',
    successText: '#ffffff',
    errorBg: 'rgba(220,38,38,0.95)',
    errorText: '#ffffff',
  },
  tab: {
    active: '#F97316',     // orange (consistent with dark mode)
    inactive: '#94A3B8',   // slate-400 (was warm #A39E96)
    bg: '#FFFFFF',         // white tab bar (was warm #F5F3EF)
    border: '#E2E8F0',    // slate-200 (was warm #E8E4DE)
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
