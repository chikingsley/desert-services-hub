-- Pending contracts from projects (legacy projection field).
-- Uses index-friendly predicate shape (`=` or `IS NULL`) instead of COALESCE in WHERE.
SELECT
  id,
  name,
  contractor,
  COALESCE(contract_status, 'Pending') AS contract_status
FROM projects
WHERE contract_status = 'Pending' OR contract_status IS NULL
ORDER BY name;
