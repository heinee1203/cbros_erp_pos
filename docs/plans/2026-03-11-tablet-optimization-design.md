# Apex POS Tablet Optimization Design

> **Context**: App is primarily used on 10" Android tablets in automotive parts shops.
> Workers may wear gloves; screen is viewed from ~18" distance (farther than phone).

## UX Architecture (ArchitectUX)

### Device Strategy
- **Primary target**: 10" Android tablets (~800x1280dp portrait, ~1280x800dp landscape)
- **Detection**: `useWindowDimensions()` hook, breakpoint at `>=768dp` width
- **Orientation**: Support both, but **landscape is primary** for POS workflow
- **Fallback**: Phone layout preserved for <768dp (field testing on phones)

### Layout System

| Breakpoint | Width   | Layout           | Screen Padding | Columns |
|------------|---------|------------------|----------------|---------|
| Phone      | <768dp  | Single column    | 16dp           | 1       |
| Tablet     | >=768dp | Split/multi-col  | 24dp           | 2-3     |

### Navigation Architecture

**Phone**: Bottom tab bar (3 tabs: POS, Transactions, Settings)
**Tablet**: Left side navigation rail (72dp wide, icons + labels, always visible)

Rationale: Bottom tabs waste horizontal space on tablets. Side rail keeps navigation
accessible while maximizing content area. 72dp width follows Material Design 3 specs.

### POS Workflow (Critical Path)

**Phone**: Catalog (full screen) -> navigate to Cart (full screen)
**Tablet**: Persistent split view — Catalog (60%) | Cart panel (40%)

This eliminates navigation friction. Cashier sees both catalog and cart simultaneously.
Cart panel updates live as items are added from catalog. This is the #1 UX improvement.

### Transaction Workflow

**Phone**: Transaction list (full screen) -> navigate to Detail (full screen)
**Tablet**: Master-detail split — List (40%) | Detail panel (60%)

### Settings / Printer

**Phone**: Single column scrollable cards
**Tablet**: Centered content with max-width 600dp (no split needed)

## UI Design System (UIDesigner)

### Responsive Spacing Tokens

```
Phone:  screenPadding=16, cardGap=8, sectionGap=12
Tablet: screenPadding=24, cardGap=12, sectionGap=16
```

### Typography Scaling

Tablet text is read from further away. Scale up body text.

```
Phone base: 15dp (body), 13dp (caption), 14dp (mono)
Tablet base: 16dp (body), 14dp (caption), 15dp (mono)
```

Display/heading fonts stay the same (already large enough).

### Touch Targets

```
Phone:  min 52dp (glove-friendly)
Tablet: min 56dp (larger finger targets at distance)
```

### Component Adaptations

| Component      | Phone               | Tablet                           |
|----------------|---------------------|----------------------------------|
| BottomSheet    | Full-width modal    | Centered dialog (max 480dp wide) |
| FavoritesGrid  | 3 columns, max 6    | 6 columns, max 12               |
| ProductListItem| Compact single row  | Wider with more detail visible   |
| Cart line item | Compact             | Wider qty controls, larger text  |
| Payment chips  | Wrap to 2 rows      | Single row (more space)          |
| Nav rail       | Bottom tabs (64dp)  | Left rail (72dp wide)           |
| Charge button  | Full width bottom   | Full width in cart panel         |

### Grid System

FavoritesGrid on tablet:
- 6 tiles per row instead of 3
- Max 12 favorites (2 rows of 6)
- Tile size adapts to available width

### Split View Architecture

```
+---+---------------------------+------------------+
|   |                           |                  |
| N |   PRIMARY CONTENT (60%)   |  PANEL (40%)     |
| A |                           |                  |
| V |   (Catalog / Tx List)     |  (Cart / Detail) |
|   |                           |                  |
| R |                           |                  |
| A |                           |                  |
| I |                           |                  |
| L |                           |                  |
+---+---------------------------+------------------+
 72dp
```

## Implementation Components

1. `useLayout` hook — returns `{ isTablet, screenPadding, columns, ... }`
2. `TabletNavRail` — side navigation component
3. `SplitView` — generic master-detail container
4. Updated `spacing.ts` — tablet-adaptive layout tokens
5. Screen-level adaptations using `useLayout` conditionals
