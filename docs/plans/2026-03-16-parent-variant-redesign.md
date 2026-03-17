# Parent/Variant Product Redesign

## Problem

The current Is Parent checkbox + Parent Product search is confusing. Users must create parents and children separately, then manually link them. Parent items shouldn't have SKU/barcode — only children should.

## Design

### New Item Flow

1. Fill parent info: Name, Family, Category, Brand
2. Check "This item has variants" — SKU/barcode fields hide
3. Variants section appears: table with Suffix, SKU, Sell Price per variant
4. On save: parent created (no SKU/barcode, is_parent=true) + children created (full name = parent name + " — " + suffix, own SKU/barcode/price, inherits family/category/brand)

### Edit Parent Flow

- Shared fields editable at top
- Variants table below: Suffix | SKU | Sell | Stock | actions
- [+ Add Variant] adds inline row
- Click variant name opens full edit page
- Save updates parent AND creates new variants

### API Changes

- POST /products with variants array creates parent + children in one transaction
- PATCH /products/:id on parent accepts newVariants array
- GET /products/:id on parent includes variants array

### Removals

- "This is a Parent Item" checkbox
- "Parent Product" search dropdown
- Manual parent linking from child side

### No DB Changes

Existing is_parent + parent_product_id columns are sufficient.
