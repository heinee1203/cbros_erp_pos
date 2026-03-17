# Loyverse-Style Per-Location CSV Import/Export Redesign

**Date:** 2026-03-18
**Status:** Approved

## Overview

Redesign item CSV import/export to use Loyverse-style per-location columns. Each active location gets 5 dynamic columns: Available for sale, Price, In stock, Low stock, Optimal stock. Also adds `description` column to products table.

## Schema Change

Add `description VARCHAR(2000)` nullable column to products table. Extend create/update Zod schemas.

## API: GET /products/export

Returns denormalized products with per-location inventory data. Reuses existing filter params. Bulk-fetches inventory rows joined with locations, builds Map, attaches to each product. Response includes top-level `locations` array for column ordering.

## API: POST /products/import (updated)

Extended schema accepts: handle, defaultPrice, cost, variablePrice, trackStock, description, option fields, plus `locations[]` array with per-location inventory. Upserts inventory rows via onConflictDoUpdate on (productId, locationId) unique index. Per-location price stored but not applied (no location_prices table yet).

## Frontend: Dynamic Template

Fetches GET /locations, generates headers with 5 columns per active location. Includes sample row.

## Frontend: Export

Calls GET /products/export instead of GET /products. Generates CSV with per-location columns from response.

## Frontend: Import Parser

Detects per-location columns from headers by pattern matching against org locations. Parses into locations array, sends to updated POST /products/import.
