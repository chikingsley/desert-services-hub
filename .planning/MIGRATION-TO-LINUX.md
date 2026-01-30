# Migration to Linux Server

> Created: 2026-01-29
> Status: PENDING
> Reason: Local Mac storage full (8.9 GB free, need ~31 GB more for plans sync)

## Current State

| Component | Location | Size |
|-----------|----------|------|
| MinIO container | `desert-aistor` | 71 GB |
| MinIO volume | `desert-services-hub_aistor_data` | 71 GB |
| SQLite database | `services/contract/census/census.db` | ~100 MB |
| Codebase | `desert-services-hub/` | ~small |

### MinIO Buckets Breakdown

- `email-attachments`: 50,461 files, 36.63 GB
- `monday-plans`: 777 files, 33.46 GB (incomplete - ~700 more files to sync)
- `monday-estimates`: 607 files, 0.10 GB

### Pending Work After Migration

- Complete plans sync (~700 more files, ~31 GB)
- Resume email sync if needed

---

## Migration Steps

### Step 1: Export MinIO Data (on Mac)

```bash
# Navigate to a location with enough temp space (or external drive)
cd /path/with/space

# Export the MinIO volume to a tar file (~71 GB, will take a while)
docker run --rm \
  -v desert-services-hub_aistor_data:/data \
  -v $(pwd):/backup \
  alpine tar cvf /backup/minio-data.tar /data

# Verify the tar was created
ls -lh minio-data.tar
```

### Step 2: Copy SQLite Database

```bash
# Copy the census database
cp ~/Documents/Github/desert-services-hub/services/contract/census/census.db ./census.db
```

### Step 3: Copy Environment Files

```bash
# Copy .env files (contains API keys)
cp ~/Documents/Github/desert-services-hub/.env ./dot-env-backup
cp ~/Documents/Github/desert-services-hub/.env.local ./dot-env-local-backup 2>/dev/null || true
```

### Step 4: SCP Everything to Linux Server

```bash
# Transfer files to Linux server
scp minio-data.tar user@linux-server:/path/to/destination/
scp census.db user@linux-server:/path/to/destination/
scp dot-env-backup user@linux-server:/path/to/destination/
```

### Step 5: On Linux Server - Setup

```bash
# SSH into Linux server
ssh user@linux-server

# Clone the repo (or pull latest)
git clone https://github.com/YOUR_ORG/desert-services-hub.git
# OR if already cloned:
cd desert-services-hub && git pull

# Restore .env files
cp /path/to/destination/dot-env-backup .env

# Restore SQLite database
cp /path/to/destination/census.db services/contract/census/census.db
```

### Step 6: On Linux Server - Restore MinIO Volume

```bash
# Create the MinIO volume if it doesn't exist
docker volume create minio-data

# Import the tar into the volume
docker run --rm \
  -v minio-data:/data \
  -v /path/to/destination:/backup \
  alpine tar xvf /backup/minio-data.tar -C /

# Start MinIO container (adjust as needed for your docker-compose)
docker-compose up -d minio
```

### Step 7: Verify Everything Works

```bash
# Install dependencies
bun install

# Test MinIO connection
bun -e "import { minioClient } from './lib/minio'; const buckets = await minioClient.listBuckets(); console.log(buckets);"

# Test database
bun services/contract/census/sync-estimates.ts --stats

# Continue plans sync
bun services/contract/census/sync-estimates.ts --include-plans --limit=500
```

---

## Post-Migration Cleanup (on Mac)

Once verified working on Linux:

```bash
# Remove the tar file to free space
rm minio-data.tar

# Optionally stop/remove the local MinIO container
docker stop desert-aistor
docker rm desert-aistor
docker volume rm desert-services-hub_aistor_data
```

---

## Notes

- The tar export/import preserves all file metadata and bucket structure
- MinIO stores data in a specific format under `/data/.minio.sys/` - don't modify manually
- The SQLite database has all email metadata, estimates, and sync state
- API keys in `.env` are required for Monday.com, Microsoft Graph, and MinIO access

## Linux Server Requirements

- Docker installed
- At least 150 GB free disk space (for current data + growth)
- Ports 9000-9001 available for MinIO
- Node.js/Bun installed for running sync scripts
