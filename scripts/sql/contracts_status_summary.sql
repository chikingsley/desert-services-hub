-- Coarse contract-status counts from projects (legacy projection field).
-- Fast path: fixed-shape aggregate with FILTER clauses.
SELECT
  COUNT(*) FILTER (WHERE contract_status = 'Pending' OR contract_status IS NULL) AS pending,
  COUNT(*) FILTER (WHERE contract_status = 'Received') AS received,
  COUNT(*) FILTER (WHERE contract_status = 'Sent Back') AS sent_back,
  COUNT(*) FILTER (WHERE contract_status = 'Executed') AS executed,
  COUNT(*) AS total
FROM projects;
