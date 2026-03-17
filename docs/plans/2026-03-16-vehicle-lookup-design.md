# Vehicle Lookup Page Design

## Purpose
Counter-staff workflow: customer says "parts for my Mitsubishi Mirage 2015" -> staff picks Make -> Model -> Year -> sees all compatible parts grouped by family with stock and pricing.

## Changes

### 1. Sidebar
Rename "Attributes" to "Vehicle Lookup". Update href to `/inventory/vehicle-lookup`, match pattern to `/^\/inventory\/vehicle-lookup/`.

### 2. API (GET /products)
Extend existing vehicleMake filter with two new params:
- `vehicleModel` — ILIKE partial match (`vc.model ILIKE '%Mirage%'`)
- `vehicleYear` — integer, filters where `year BETWEEN vc.year_start AND vc.year_end`

Added to existing EXISTS subquery in the conditions array.

### 3. Hook (use-vehicles.ts)
New `useVehicleSearch(token, locationId, { make, model?, year? })` wrapping GET /products with vehicle params and limit=500.

### 4. Page (apps/web/src/app/inventory/vehicle-lookup/page.tsx)
- 3 cascading inputs: Make (searchable, merged with PH_DEFAULT_MAKES), Model (datalist autocomplete), Year (optional number)
- Search button enabled when Make selected
- Results grouped by familyName on frontend, sorted by group size desc
- Collapsible sections per family, first auto-expanded
- Summary bar: total / in-stock / out-of-stock
- StockPill for stock status, fmtPeso for pricing
- Row click navigates to edit page
- Empty states for pre-search and no-results

### 5. Cleanup
Delete `apps/web/src/app/inventory/attributes/page.tsx`.

## Model Match Strategy
Case-insensitive ILIKE partial match — "Mirage" finds "Mirage", "Mirage G4", "MIRAGE SPORT".
