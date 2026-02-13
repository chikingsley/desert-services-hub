-- Normalize legacy rows and remove redundant unit_cost from estimate line items.
-- Canonical pricing field is unit_price (per-unit sell price).

UPDATE estimate_line_items
SET unit_price = CASE
  -- Legacy bad rows: unit_price stored extended total while unit_cost stored per-unit.
  WHEN quantity > 0 AND abs(unit_price - (unit_cost * quantity)) < 0.01 THEN unit_cost
  -- Missing/zero unit_price but non-zero unit_cost.
  WHEN abs(unit_price) < 0.01 AND abs(unit_cost) > 0.01 THEN unit_cost
  ELSE unit_price
END
WHERE unit_cost IS NOT NULL;

-- Recompute version totals from normalized unit_price.
UPDATE estimate_versions v
SET total = COALESCE(x.total, 0)
FROM (
  SELECT version_id, SUM(quantity * unit_price) AS total
  FROM estimate_line_items
  GROUP BY version_id
) x
WHERE v.id = x.version_id;

ALTER TABLE estimate_line_items
  DROP COLUMN IF EXISTS unit_cost;
