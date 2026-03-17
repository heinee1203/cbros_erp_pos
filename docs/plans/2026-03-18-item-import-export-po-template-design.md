# Item List Import/Export + PO CSV Template Download

**Date:** 2026-03-18
**Status:** Approved

## Part 1: Item List Export

Pure client-side CSV generation. Two modes:

- **Current page** — uses `products` array already in memory
- **Export All** — single API call `GET /products?...&limit=50000` with current filters, then generates CSV

CSV columns: Name, SKU, Barcode, OEM Number, Family, Category, Sub-category, Brand, Sell Price, Cost Price, Margin %, Stock, Reorder Point, Variable Price, Active

File naming: `apex-items-YYYY-MM-DD.csv` with UTF-8 BOM for Excel compatibility.

Bulk-selection Export button exports only selected items.

No API changes needed.

## Part 2: Item List Import

### API Endpoint

`POST /products/import`

Request body:
```json
{
  "dryRun": true,
  "rows": [
    {
      "name": "AKEBONO AN-468WK DB-1390",
      "sku": "AN-468WK",
      "barcode": "1234567890123",
      "oemNumber": "MB295982",
      "family": "Brakes",
      "category": "Brake Pad",
      "brand": "AKEBONO",
      "unitPrice": "2500.00",
      "costPrice": "1630.00",
      "reorderPoint": 10,
      "isVariablePrice": false
    }
  ]
}
```

Response:
```json
{
  "created": 2,
  "updated": 1,
  "errors": [{ "row": 3, "sku": "", "error": "Name is required" }],
  "results": [
    { "row": 0, "sku": "AN-468WK", "name": "AKEBONO...", "action": "create" },
    { "row": 1, "sku": "DB-1390", "name": "BENDIX...", "action": "update" },
    { "row": 2, "sku": "FALKEN-001", "name": "FALKEN...", "action": "create" }
  ]
}
```

### Server Logic (single transaction)

1. Load all existing SKUs for org -> Map<sku, productId>
2. Load families, categories, subcategories, brands by name -> name-to-id Maps
3. Per row: SKU exists -> PATCH; SKU new -> CREATE (auto mnemonic SKU, auto barcode, inventory row)
4. If `dryRun: true` -> rollback transaction, return preview
5. If `dryRun: false` -> commit transaction, return results

### Frontend Flow

1. Click "Import" -> modal with "Download Template" + file upload
2. Upload CSV -> client parses, sends `POST /products/import` with `dryRun: true`
3. Preview table: New / Update / Error status per row
4. Click "Import N Items" -> `POST /products/import` with `dryRun: false`
5. Toast with results, list refreshes

### Template CSV

```
Name,SKU,Barcode,OEM Number,Family,Category,Sub-category,Brand,Sell Price,Cost Price,Reorder Point,Variable Price
Sample Brake Pad,SAMPLE-001,1234567890123,MB295982,Brakes,Brake Pad,,AKEBONO,2500.00,1630.00,10,No
```

## Part 3: PO CSV Template Download

Add "Download template" link next to existing "Import CSV" button on `/procurement/purchase-orders/new`.

Template:
```
SKU,Qty,List Price,Discount,Notes
SDG-30003,10,26500,"20,5,3",Sample with chain discount
DB-1390,20,1550,15,Sample with single discount
14624134,5,3400,,Sample with no discount
```

No API changes. Existing CSV import modal already handles discount columns.
