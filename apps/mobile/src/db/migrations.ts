import { schemaMigrations, addColumns, unsafeExecuteSql } from '@nozbe/watermelondb/Schema/migrations';

export const migrations = schemaMigrations({
  migrations: [
    {
      toVersion: 2,
      steps: [
        addColumns({
          table: 'products',
          columns: [{ name: 'is_variable_price', type: 'boolean' }],
        }),
      ],
    },
    {
      toVersion: 3,
      steps: [
        addColumns({
          table: 'inventory',
          columns: [{ name: 'available_for_sale', type: 'boolean' }],
        }),
      ],
    },
    {
      toVersion: 4,
      steps: [
        addColumns({
          table: 'products',
          columns: [
            { name: 'parent_product_id', type: 'string', isOptional: true },
            { name: 'is_parent', type: 'boolean' },
          ],
        }),
      ],
    },
    {
      toVersion: 5,
      steps: [
        addColumns({
          table: 'products',
          columns: [{ name: 'brand_id', type: 'string', isOptional: true }],
        }),
      ],
    },
    {
      toVersion: 6,
      steps: [
        addColumns({
          table: 'products',
          columns: [{ name: 'family_name', type: 'string', isOptional: true }],
        }),
      ],
    },
    {
      toVersion: 7,
      steps: [
        addColumns({
          table: 'products',
          columns: [{ name: 'oem_number', type: 'string', isOptional: true }],
        }),
      ],
    },
    {
      toVersion: 8,
      steps: [
        addColumns({
          table: 'products',
          columns: [
            { name: 'is_serialized', type: 'boolean' },
            { name: 'is_tire', type: 'boolean' },
            { name: 'warranty_months', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 9,
      steps: [
        unsafeExecuteSql(`
          create index if not exists "products_parent_name" on "products" ("parent_product_id", "name");
          create index if not exists "products_family_parent_name" on "products" ("family_name", "parent_product_id", "name");
          create index if not exists "inventory_location_product" on "inventory" ("location_id", "product_server_id");
          create index if not exists "inventory_available_location" on "inventory" ("available_for_sale", "location_id");
        `),
      ],
    },
  ],
});
