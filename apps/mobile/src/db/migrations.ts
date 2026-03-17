import { schemaMigrations, addColumns } from '@nozbe/watermelondb/Schema/migrations';

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
  ],
});
