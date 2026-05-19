export const darkColors = {
  bg: {
    base: '#111827',
    primary: '#111827',
    surface: '#1F2937',
    elevated: '#273449',
    overlay: '#374151',
    input: '#182231',
  },
  border: {
    default: 'rgba(203,213,225,0.18)',
    subtle: 'rgba(203,213,225,0.10)',
    light: 'rgba(203,213,225,0.26)',
    medium: 'rgba(203,213,225,0.34)',
    focus: '#2563EB',
  },
  text: {
    primary: '#F9FAFB',
    secondary: '#CBD5E1',
    muted: '#94A3B8',
    inverse: '#FFFFFF',
  },
  accent: {
    primary: '#2563EB',
    pressed: '#1D4ED8',
    hover: '#1D4ED8',
    glow: 'rgba(37,99,235,0.16)',
    muted: 'rgba(37,99,235,0.08)',
  },
  status: {
    success: '#10B981',
    successBg: 'rgba(16,185,129,0.14)',
    successText: '#34D399',
    warning: '#F59E0B',
    warningBg: 'rgba(245,158,11,0.14)',
    warningText: '#FBBF24',
    danger: '#EF4444',
    dangerBg: 'rgba(239,68,68,0.14)',
    dangerText: '#F87171',
    info: '#38BDF8',
    infoBg: 'rgba(56,189,248,0.14)',
    infoText: '#7DD3FC',
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
    offlineBg: 'rgba(245,158,11,0.16)',
    offlineText: '#FBBF24',
    reconnectBg: 'rgba(56,189,248,0.16)',
    reconnectText: '#7DD3FC',
    staleBg: 'rgba(245,158,11,0.12)',
    staleText: '#FBBF24',
  },
  shift: {
    bannerBg: '#182231',
    bannerBorder: '#334155',
    bannerText: '#93C5FD',
    bannerBtnBg: '#2563EB',
    bannerBtnText: '#FFFFFF',
  },
  toast: {
    successBg: 'rgba(16,185,129,0.95)',
    successText: '#ffffff',
    errorBg: 'rgba(239,68,68,0.95)',
    errorText: '#ffffff',
  },
  tab: {
    active: '#60A5FA',
    inactive: '#94A3B8',
    bg: '#111827',
    border: '#273449',
  },
  transparent: 'transparent',
  white: '#ffffff',
  black: '#000000',
} as const;

type DeepString<T> = { [K in keyof T]: T[K] extends object ? { [J in keyof T[K]]: string } : string };
type ColorPalette = DeepString<typeof darkColors>;

export const lightColors: ColorPalette = {
  bg: {
    base: '#F4F6F8',
    primary: '#F4F6F8',
    surface: '#FFFFFF',
    elevated: '#EEF2F5',
    overlay: '#E2E8F0',
    input: '#FFFFFF',
  },
  border: {
    default: '#D2DAE5',
    subtle: '#E3E8EF',
    light: '#C7D0DC',
    medium: '#AEB9C8',
    focus: '#1F6E8C',
  },
  text: {
    primary: '#172033',
    secondary: '#485568',
    muted: '#6F7B8E',
    inverse: '#FFFFFF',
  },
  accent: {
    primary: '#1F6E8C',
    pressed: '#155A74',
    hover: '#155A74',
    glow: 'rgba(31,110,140,0.12)',
    muted: 'rgba(31,110,140,0.08)',
  },
  status: {
    success: '#0F8A5F',
    successBg: 'rgba(15,138,95,0.10)',
    successText: '#0B6F4B',
    warning: '#B7791F',
    warningBg: 'rgba(183,121,31,0.12)',
    warningText: '#8B5E15',
    danger: '#C2413A',
    dangerBg: 'rgba(194,65,58,0.10)',
    dangerText: '#9F302B',
    info: '#2563A8',
    infoBg: 'rgba(37,99,168,0.10)',
    infoText: '#1D4F88',
    ok: '#0F8A5F',
    low: '#B7791F',
    out: '#C2413A',
  },
  stock: {
    ok: '#0F8A5F',
    low: '#B7791F',
    out: '#C2413A',
  },
  sync: {
    offlineBg: 'rgba(183,121,31,0.12)',
    offlineText: '#8B5E15',
    reconnectBg: 'rgba(37,99,168,0.12)',
    reconnectText: '#1D4F88',
    staleBg: 'rgba(183,121,31,0.10)',
    staleText: '#7C4F12',
  },
  shift: {
    bannerBg: '#EEF6F8',
    bannerBorder: '#B9D3DE',
    bannerText: '#155A74',
    bannerBtnBg: '#1F6E8C',
    bannerBtnText: '#FFFFFF',
  },
  toast: {
    successBg: 'rgba(15,138,95,0.95)',
    successText: '#ffffff',
    errorBg: 'rgba(194,65,58,0.95)',
    errorText: '#ffffff',
  },
  tab: {
    active: '#1F6E8C',
    inactive: '#6F7B8E',
    bg: '#FFFFFF',
    border: '#DCE3EB',
  },
  transparent: 'transparent',
  white: '#ffffff',
  black: '#000000',
} as const;

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

export const colors: typeof darkColors = JSON.parse(JSON.stringify(lightColors));

export function _setActiveTheme(_isDark: boolean) {
  deepAssign(colors, lightColors);
}
