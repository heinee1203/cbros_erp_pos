-- 0024: Category Hierarchy — ensure 5 parent categories exist & link sub-categories

-- 1a. Ensure the 5 broad parent categories exist for every org
INSERT INTO categories (org_id, name, slug, code, sort_order, is_active)
SELECT o.id, v.name, v.slug, v.code, v.sort_order, true
FROM organizations o
CROSS JOIN (VALUES
  ('Tires',       'tires',       'TIRES',          1),
  ('Hard Parts',  'hard-parts',  'HARD_PARTS',     2),
  ('Lubricants',  'lubricants',  'LUBRICANTS',     3),
  ('Accessories', 'accessories', 'ACCESSORIES',    4),
  ('Services',    'services',    'LABOR_SERVICES', 5)
) AS v(name, slug, code, sort_order)
ON CONFLICT (org_id, code) DO NOTHING;

-- 1b. Link sub-categories to their parent based on dominant product broad type
WITH parent_mapping AS (
  SELECT
    p.category_id,
    c_parent.id AS parent_id,
    ROW_NUMBER() OVER (PARTITION BY p.category_id ORDER BY COUNT(*) DESC) AS rn
  FROM products p
  JOIN categories c_parent
    ON c_parent.org_id = p.org_id
    AND c_parent.code = p.category::text
  WHERE p.category_id IS NOT NULL
  GROUP BY p.category_id, c_parent.id
)
UPDATE categories AS sub
SET parent_id = pm.parent_id
FROM parent_mapping pm
WHERE sub.id = pm.category_id
  AND pm.rn = 1
  AND sub.parent_id IS NULL;
