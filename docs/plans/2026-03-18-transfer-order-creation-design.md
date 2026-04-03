# Transfer Order: Full-Page Creation + CSV Import + Edit

**Date:** 2026-03-18
**Status:** Approved

## Overview

Add transfer creation UI, CSV import, DRAFT editing, and list page enhancements to the existing transfer order system.

## Section 1: New Transfer Creation Page

New file: `apps/web/src/app/procurement/transfer-orders/new/page.tsx`. Source/Destination selects from `useLocations` (mutually exclusive). Product search at source location shows available stock. Lines with `transferQty` capped at `availableStock`. Save calls `POST /transfers`, optionally auto-approves for "Submit" mode.

## Section 2: CSV Import

Template: `SKU,Transfer Qty`. Upload parses, looks up SKUs at source location, preview modal shows match/insufficient/not-found. Import adds matched lines.

## Section 3: Edit DRAFT Transfer

API: `PATCH /transfers/:id` (notes), `POST /transfers/:id/items`, `PATCH /transfers/:id/items/:itemId`, `DELETE /transfers/:id/items/:itemId`. All DRAFT-only. UI: inline editing on detail page for DRAFT status.

## Section 4: List Page Enhancements

`+ New Transfer` link, status filter, summary counts, item/unit counts per row.

## Section 5: Detail Page Source Stock

Add source stock column to items table for context.
