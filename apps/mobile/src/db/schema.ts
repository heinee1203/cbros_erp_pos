import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const schema = appSchema({
  version: 2,
  tables: [
    tableSchema({
      name: 'products',
      columns: [
        { name: 'server_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'sku', type: 'string', isIndexed: true },
        { name: 'mnemonic_sku', type: 'string', isIndexed: true },
        { name: 'barcode', type: 'string', isOptional: true, isIndexed: true },
        { name: 'category', type: 'string' },
        { name: 'unit_price', type: 'number' },
        { name: 'image_url', type: 'string', isOptional: true },
        { name: 'is_variable_price', type: 'boolean' },
        { name: 'family_id', type: 'string', isOptional: true },
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
