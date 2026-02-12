-- Set a default contract-packet SLA so queue and breach detection are active by default.
-- Teams can still override per packet.

ALTER TABLE public.contract_packets
  ALTER COLUMN sla_minutes SET DEFAULT 1440;

UPDATE public.contract_packets
SET sla_minutes = 1440,
    updated_at = now()
WHERE sla_minutes IS NULL;
