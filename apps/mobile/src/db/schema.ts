import { appSchema, tableSchema } from '@nozbe/watermelondb';

const catalogIndexSql = `
create index if not exists "products_parent_name" on "products" ("parent_product_id", "name");
create index if not exists "products_family_parent_name" on "products" ("family_name", "parent_product_id", "name");
create index if not exists "inventory_location_product" on "inventory" ("location_id", "product_server_id");
create index if not exists "inventory_available_location" on "inventory" ("available_for_sale", "location_id");
`;

export const schema = appSchema({
  version: 9,
  unsafeSql: (sql, kind) => (
    kind === 'setup' || kind === 'create_indices'
      ? `${sql}${catalogIndexSql}`
      : sql
  ),
  tables: [
    tableSchema({
      name: 'products',
      columns: [
        { name: 'server_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string', isIndexed: true },
        { name: 'sku', type: 'string', isIndexed: true },
        { name: 'mnemonic_sku', type: 'string', isIndexed: true },
        { name: 'barcode', type: 'string', isOptional: true, isIndexed: true },
        { name: 'oem_number', type: 'string', isOptional: true },
        { name: 'category', type: 'string' },
        { name: 'unit_price', type: 'number' },
        { name: 'image_url', type: 'string', isOptional: true },
        { name: 'is_variable_price', type: 'boolean' },
        { name: 'family_id', type: 'string', isOptional: true },
        { name: 'family_name', type: 'string', isOptional: true, isIndexed: true },
        { name: 'brand_id', type: 'string', isOptional: true },
        { name: 'parent_product_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'is_parent', type: 'boolean' },
        { name: 'is_serialized', type: 'boolean' },
        { name: 'is_tire', type: 'boolean' },
        { name: 'warranty_months', type: 'number', isOptional: true },
        { name: 'server_updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'inventory',
      columns: [
        { name: 'server_id', type: 'string', isIndexed: true },
        { name: 'product_server_id', type: 'string', isIndexed: true },
        { name: 'location_id', type: 'string', isIndexed: true },
        { name: 'stock_level', type: 'number' },
        { name: 'reserved_level', type: 'number' },
        { name: 'reorder_point', type: 'number' },
        { name: 'available_for_sale', type: 'boolean' },
        { name: 'server_updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'recent_customers',
      columns: [
        { name: 'server_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'phone', type: 'string', isIndexed: true },
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'cached_at', type: 'number' },
      ],
    }),
  ],
});
