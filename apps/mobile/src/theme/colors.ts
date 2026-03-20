/**
 * Premium Dark — Warm-toned dark palette with amber/gold accents.
 * Layered depth backgrounds, warm whites, and clear status colors.
 */
export const colors = {
  // Backgrounds — layered depth
  bg: {
    base: '#0D0D0F',         // deepest background (behind everything)
    primary: '#0D0D0F',      // alias for base
    surface: '#141417',       // main content surface
    elevated: '#1A1A1F',     // cards, modals, elevated panels
    overlay: '#222228',       // dropdown menus, popovers
    input: '#141417',         // input fields
  },

  // Borders
  border: {
    default: 'rgba(255,255,255,0.08)',
    subtle: 'rgba(255,255,255,0.06)',    // hairline dividers
    light: 'rgba(255,255,255,0.10)',      // input borders, card outlines
    medium: 'rgba(255,255,255,0.16)',     // focused input borders
    focus: '#F5A623',                     // kept for existing Input component usage
  },

  // Text — clear hierarchy (warm whites, not blue-tinted)
  text: {
    primary: '#F2F0ED',       // warm white
    secondary: '#9B978F',     // readable but receded
    muted: '#5A5750',         // labels, hints, timestamps
    inverse: '#0D0D0F',       // text on accent backgrounds
  },

  // Accent — warm amber/gold
  accent: {
    primary: '#F5A623',       // main accent (buttons, active states, prices)
    pressed: '#E09520',       // slightly darker for pressed states
    hover: '#E09520',         // alias
    glow: 'rgba(245,166,35,0.12)',  // subtle background tint
    muted: 'rgba(245,166,35,0.06)', // very subtle hover/active background
  },

  // Status
  status: {
    success: '#34C759',
    successBg: 'rgba(52,199,89,0.1)',
    successText: '#34C759',
    warning: '#FFB300',
    warningBg: 'rgba(255,179,0,0.1)',
    warningText: '#FFB300',
    danger: '#FF3B30',
    dangerBg: 'rgba(255,59,48,0.1)',
    dangerText: '#FF3B30',
    info: '#00B8FF',
    infoBg: 'rgba(0,184,255,0.12)',
    infoText: '#00B8FF',
    ok: '#34C759',       // alias for stock badge compatibility
    low: '#FFB300',      // alias
    out: '#FF3B30',      // alias
  },

  // Stock levels (kept for backward compatibility)
  stock: {
    ok: '#34C759',
    low: '#FFB300',
    out: '#FF3B30',
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
    successBg: 'rgba(52,199,89,0.95)',
    successText: '#ffffff',
    errorBg: 'rgba(255,59,48,0.95)',
    errorText: '#ffffff',
  },

  // Tab bar
  tab: {
    active: '#F5A623',
    inactive: '#5A5750',
    bg: '#0D0D0F',
    border: '#1A1A1F',
  },

  // Primitives
  transparent: 'transparent',
  white: '#ffffff',
  black: '#000000',
} as const;
