# Family Detail Page — Design

**Date:** 2026-03-09

## Overview

Add a clickable family detail page at `/inventory/families/[slug]` that shows family info (editable), and a simplified product list with rows linking to the main Item List. Also wire the families list page to real API data.

## Page: `/inventory/families/[slug]`

### Header Section
- Back arrow to `/inventory/families`
- Family name (editable via edit button)
- Slug shown as subtitle (auto-derived from name)
- Product count stat
- Edit Family button — inline edit of name
- Delete Family button — confirmation dialog, sets products' familyId to null

### Products Table (simplified columns)
| Column     | Format              |
|------------|---------------------|
| Name       | Clickable link      |
| SKU        | Monospace           |
| Unit Price | ₱X,XXX.XX          |
| Cost Price | ₱X,XXX.XX          |
| Stock      | Integer at location |

- Rows clickable — navigate to item in Item List
- Search bar to filter within the family
- No pagination (families typically <100 products)

## API Changes

### New Endpoints
1. **GET /products/families/:slug** — family detail with product count
2. **GET /products/families/:slug/products** — products in the family (with stock for current location)
3. **PATCH /products/families/:id** — update family name/slug
4. **DELETE /products/families/:id** — remove family (products keep familyId = null via FK onDelete)

### Enrich Existing Endpoint
- **GET /products/families** — add `productCount` to each family in the list response

## Families List Page
- Replace mock `FAMILIES` array with real API data from `GET /products/families`
- Make rows clickable → navigate to `/inventory/families/{slug}`

## Files to Create/Modify

| File | Action |
|------|--------|
| `apps/api/src/modules/products/routes.ts` | Add 4 new endpoints, enrich GET /families |
| `apps/web/src/hooks/use-families.ts` | New hook: useFamilyDetail, useFamilyProducts |
| `apps/web/src/app/inventory/families/[slug]/page.tsx` | New detail page |
| `apps/web/src/app/inventory/families/page.tsx` | Wire to API, make rows clickable |
