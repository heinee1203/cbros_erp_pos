# Product Packaging: Units Per Case with Auto-Conversion

**Date:** 2026-03-18
**Status:** Approved

## Overview

Add packaging conversion so managers work in cases/boxes for POs and transfers, while inventory always tracks in pieces. Two new columns on products: `units_per_case` (default 1) and `packaging_unit` (nullable label). Conversion happens at UI layer — API always stores pieces and per-piece costs.

## Schema

`units_per_case INTEGER NOT NULL DEFAULT 1`, `packaging_unit VARCHAR(50)` on products table.

## API

Add fields to create/update schemas, product responses, CSV import/export. No conversion logic in API.

## Product Forms

Packaging section with units per case + packaging unit dropdown. Shows "1 box = 3 pieces" helper and per-piece cost breakdown.

## PO/Transfer Creation

Case/piece toggle for cased products. Convert to pieces before API call.

## Display

Case equivalents shown as subtitles on detail pages.
