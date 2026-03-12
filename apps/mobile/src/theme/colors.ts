/**
 * Dark Forge — Industrial Premium color palette.
 * Dark-dominant with amber accents for automotive POS.
 */
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

  // Accent (industrial amber)
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

  // Stock levels
  stock: {
    ok: '#00C853',
    low: '#FFB300',
    out: '#FF3D3D',
  },

  // Sync status bar
  sync: {
    offlineBg: 'rgba(255,179,0,0.15)',
    offlineText: '#FFB300',
    reconnectBg: 'rgba(0,184,255,0.15)',
    reconnectText: '#00B8FF',
    staleBg: 'rgba(255,179,0,0.10)',
    staleText: '#B0A070',
  },

  // Shift banner
  shift: {
    bannerBg: '#3B2800',
    bannerBorder: '#5C4000',
    bannerText: '#FFB020',
    bannerBtnBg: '#FFB020',
    bannerBtnText: '#1A1000',
  },

  // Toast notifications
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

  // Primitives
  transparent: 'transparent',
  white: '#ffffff',
  black: '#000000',
} as const;
