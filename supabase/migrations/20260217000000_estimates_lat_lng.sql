-- Add lat/lng coordinate columns to estimates.
-- Monday's location column already stores lat/lng in the value JSON;
-- the sync now parses and stores them directly.
ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision;
