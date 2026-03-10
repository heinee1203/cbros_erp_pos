# Android POS: Industrial Premium Redesign

**Date:** 2026-03-10
**Status:** Approved
**Approach:** B — Design system first, then features, then polish

## Overview

Full UX overhaul of the React Native Android POS app with an "Industrial Premium" aesthetic (dark mode dominant, sharp edges, bold typography, amber accents) plus 3 new features: customer lookup, quick-add favorites, and refund/void flow.

## Phase 1: Design System — "Dark Forge"

### Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `bg.primary` | `#0C0C12` | App background |
| `bg.surface` | `#16161F` | Cards, panels, list rows |
| `bg.elevated` | `#1E1E2A` | Modals, floating elements |
| `bg.input` | `#12121A` | Input fields |
| `border.default` | `#2A2A3A` | Dividers, borders |
| `border.focus` | `#FF8A00` | Focused input ring |
| `text.primary` | `#F0F0F5` | Headings, primary content |
| `text.secondary` | `#8B8B9E` | Labels, descriptions |
| `text.muted` | `#5A5A6E` | Placeholders, disabled |
| `accent.primary` | `#FF8A00` | CTA buttons, active tabs, badges |
| `accent.glow` | `rgba(255,138,0,0.15)` | Subtle glow behind active elements |
| `status.success` | `#00C853` | Stock OK, sale complete |
| `status.warning` | `#FFB300` | Low stock, pending |
| `status.danger` | `#FF3D3D` | Errors, destructive |
| `status.info` | `#00B8FF` | Reconnecting, info |

### Typography — Bundled Fonts

- **Display/Headings:** Outfit (800/700/600 weights)
- **Body/UI:** DM Sans (400/500/600 weights)
- **Monospace/Data:** JetBrains Mono (400/500/600 weights)

| Scale | Size | Weight | Font | Usage |
|-------|------|--------|------|-------|
| `display` | 28px | 800 | Outfit | Screen titles |
| `heading` | 20px | 700 | Outfit | Section headers |
| `subheading` | 16px | 600 | Outfit | Card titles |
| `body` | 15px | 400 | DM Sans | Regular text |
| `caption` | 13px | 500 | DM Sans | Labels |
| `mono.lg` | 18px | 600 | JetBrains Mono | Prices, totals |
| `mono.md` | 14px | 500 | JetBrains Mono | SKUs |
| `mono.sm` | 12px | 400 | JetBrains Mono | Timestamps |

### Component Library

| Component | Variants | Notes |
|-----------|----------|-------|
| `Button` | primary (amber), secondary (dark+border), danger (red) | 52px min height, haptic on press |
| `IconButton` | circle, square | 44px touch target |
| `Card` | default, elevated | 2px border-radius, #2A2A3A border |
| `Input` | text, search, numeric | Dark bg, amber focus ring, floating label |
| `Badge` | success, warning, danger, info | Slight glow effect |
| `Chip` | filter, toggle | Dark/amber states |
| `BottomSheet` | modal | Backdrop blur, drag handle |
| `Toast` | success, error, info | Slide-in from top, auto-dismiss |
| `Skeleton` | row, card, grid | Dark shimmer pulse |
| `ListRow` | default, alternating | Press ripple effect |
| `Divider` | hairline | #2A2A3A |
| `TabBar` | bottom | Amber active indicator + glow |

### Spacing & Layout

- Border radius: 2px (default), 16px (pills)
- Spacing: 4, 8, 12, 16, 20, 24, 32, 48
- Touch targets: 52px minimum (shop workers may wear gloves)
- Screen padding: 16px horizontal

### Micro-interactions

- Button press: scale 0.97 + haptic light impact
- List row press: ripple from touch point (300ms)
- Tab switch: crossfade 200ms + amber indicator slide
- Cart add: toast slides down with spring physics
- Quantity change: digit roll animation
- Pull to refresh: custom amber spinner
- Screen transitions: fade + slight slide

## Phase 2: Screen Redesigns

### Catalog Screen

- Dark bg throughout, no white surfaces
- Quick-add favorites grid at top (3x2, collapsible)
- Search bar with integrated scan button
- Scrollable filter chips: Favs | All | Tires | Lubricants | Hard Parts | Accessories
- Alternating row backgrounds (#16161F / #0C0C12)
- Product rows: mnemonic SKU (mono, left) + price (mono, right), name below dimmer
- Stock badge with dot + count
- Cart button in header with amber animated badge

### Cart Screen

- Customer bar at top (amber accent) with vehicle info
- Line items as individual dark cards
- Swipe-left-to-delete with red reveal
- Qty controls: amber −/+ buttons
- Totals section: mono font, grand total in amber
- Payment chips: Cash, Card, QRPH, GCash, Maya, Bank Transfer
- Cash tendered input with change calculation (green mono)
- Full-width amber CHARGE button

### Checkout Success/Pending

- Success: large checkmark, receipt number (mono), total (amber), Print + New Sale buttons
- Pending: hourglass (amber), queued message, New Sale button

### Transaction List

- Dark rows, receipt number (mono), time, total, glowing status badge
- Pending sales banner (amber border)
- Pull-to-refresh with amber spinner

### Transaction Detail

- Dark cards for sections: header, customer, items, totals, payment
- Refund button at bottom (red, only for COMPLETED sales)

### Settings Screen

- Dark surface cards per section
- Amber accents on active toggles
- Amber glow on "Reconcile Now" when pending > 0

## Phase 3: New Features

### Customer Lookup + Vehicle

**Entry:** Cart screen → "Add Customer" opens bottom sheet modal

**Search modal:**
- Search by name, phone, or plate number
- Results show customer name, phone, primary vehicle
- "New Customer" inline form: name + phone + optional vehicle
- Selected customer stored in cart store (Zustand)

**API endpoints used:**
- `GET /customers?q=<search>` — search customers
- `GET /customers/:id/vehicles` — fetch vehicles
- `POST /customers` — create new customer
- Checkout sends `customerId` + `customerVehicleId`

### Quick-Add Favorites

**Storage:** MMKV array of product IDs

**Interactions:**
- Long-press product in catalog → "Add to Favorites" toast + haptic
- "Favs" filter chip shows only favorited products
- Top grid: 3x2 tiles, collapsible with chevron
- Tap tile: instant add to cart (qty +1) + haptic
- Long-press tile: remove from favorites

**Tile layout:** Short name (truncated), price (mono), stock dot + count

### Refund / Void Flow

**Access:** Transaction Detail → "Refund" button (red)

**Flow:**
1. Manager PIN prompt (4-digit overlay keypad)
2. PIN verified: `POST /auth/verify-pin`
3. Select items to refund (checkboxes, default all)
4. Adjust quantities for partial refund
5. Select reason: Defective, Wrong Part, Customer Changed Mind, Other
6. Confirmation screen: refund total in red
7. "Confirm Refund": `POST /sales/:id/refund`
8. Success: status → REFUNDED or PARTIALLY_REFUNDED
9. Original detail shows strikethrough on refunded items

**Rules:**
- Only COMPLETED sales can be refunded
- Refund ≤ original sale total
- Manager PIN required (no cashier self-service)
- Refund restocks inventory (server-side)
- Idempotency key for offline safety
