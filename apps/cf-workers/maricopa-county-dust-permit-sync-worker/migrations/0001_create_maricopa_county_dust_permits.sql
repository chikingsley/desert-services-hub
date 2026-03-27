CREATE TABLE IF NOT EXISTS maricopa_county_dust_permits (
	id TEXT PRIMARY KEY,
	facility_id TEXT,
	facility_name TEXT,
	project_name TEXT,
	county_company_id TEXT,
	company_name TEXT,
	status TEXT,
	submitted_date TEXT,
	effective_date TEXT,
	expiration_date TEXT,
	closed_date TEXT,
	previous_app_id TEXT,
	project_start_date TEXT,
	project_end_date TEXT,
	address TEXT,
	city TEXT,
	parcel TEXT,
	latitude REAL,
	longitude REAL,
	is_block_permit INTEGER NOT NULL DEFAULT 0 CHECK (is_block_permit IN (0, 1)),
	is_accelerated INTEGER NOT NULL DEFAULT 0 CHECK (is_accelerated IN (0, 1)),
	invoice_number TEXT,
	invoice_charges REAL,
	invoice_balance REAL,
	source_system TEXT NOT NULL DEFAULT 'aqdata',
	synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE INDEX IF NOT EXISTS idx_maricopa_county_dust_permits_status
	ON maricopa_county_dust_permits(status);

CREATE INDEX IF NOT EXISTS idx_maricopa_county_dust_permits_company_name
	ON maricopa_county_dust_permits(company_name);

CREATE INDEX IF NOT EXISTS idx_maricopa_county_dust_permits_city
	ON maricopa_county_dust_permits(city);

CREATE INDEX IF NOT EXISTS idx_maricopa_county_dust_permits_expiration_date
	ON maricopa_county_dust_permits(expiration_date);
