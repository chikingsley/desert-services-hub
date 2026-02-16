# MinIO AIStor (Deprecated)

Removed February 2026. All file storage migrated to SharePoint.

## What It Was

MinIO AIStor was an S3-compatible object storage server (commercial/enterprise edition) used for storing email attachments, takeoff PDFs, estimate PDFs, and thumbnails. It ran as a Docker container alongside the main application.

## License

The license file is retained at `.minio/minio.license` in the repo root. It was obtained from [https://subnet.min.io](https://subnet.min.io).

## Docker Configuration

- **Image:** `quay.io/minio/aistor/minio:latest`
- **S3 API port:** 9000
- **Web Console port:** 9001
- **Default credentials:** minioadmin / minioadmin (overridable via env vars)
- **Data volume:** `aistor_data` mounted to `/data`
- **Command:** `server /data --console-address ":9001" --license /minio.license`

## Buckets

- `takeoffs` - Takeoff PDF uploads (original files for annotation)
- `quotes` - Generated estimate/quote PDFs
- `thumbnails` - Takeoff annotation thumbnail images
- `email-attachments` - PDF attachments extracted from synced emails
- `monday-estimates` - Estimate PDFs downloaded from Monday.com
- `monday-plans` - Plan PDFs downloaded from Monday.com

## Environment Variables

- `MINIO_ENDPOINT` - Server hostname (default: localhost)
- `MINIO_PORT` - API port (default: 9000)
- `MINIO_USE_SSL` - Enable HTTPS (default: false)
- `MINIO_ACCESS_KEY` - Access key (default: minioadmin)
- `MINIO_SECRET_KEY` - Secret key (default: minioadmin)
- `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` - Docker container root credentials
- `MINIO_BUCKET_TAKEOFFS`, `MINIO_BUCKET_QUOTES`, `MINIO_BUCKET_THUMBNAILS`, `MINIO_BUCKET_EMAIL_ATTACHMENTS`, `MINIO_BUCKET_MONDAY_ESTIMATES`, `MINIO_BUCKET_MONDAY_PLANS` - Bucket name overrides

## NPM Package

The `minio` npm package (v8.0.6+) provided the TypeScript client.

## How It Was Used

1. **Takeoff PDFs:** When users uploaded PDFs for takeoff annotation, the file was stored in MinIO (`takeoffs` bucket) and the URL (`minio://takeoffs/...`) was saved in the `takeoffs.pdf_url` database column.

2. **Email Attachments:** During email sync, PDF attachments were uploaded to MinIO (`email-attachments` bucket). The `storage_bucket` and `storage_path` columns in the `attachments` table reference these objects.

3. **Estimate PDFs:** Monday.com estimate PDFs were cached in MinIO during sync. The `estimate_storage_bucket` and `estimate_storage_path` columns in the `estimates` table reference these.

4. **SharePoint Migration Scripts:** The `batch-sync.ts` and `sync-project-files.ts` scripts downloaded files from MinIO and uploaded them to SharePoint.

## Database Columns (Still Present)

The following columns in hub.db still contain old MinIO paths as historical data:

- `attachments.storage_bucket`, `attachments.storage_path`
- `estimates.estimate_storage_bucket`, `estimates.estimate_storage_path`
- `estimates.plans_storage_path`, `estimates.contracts_storage_path`, `estimates.noi_storage_path`

These columns are retained for reference but no code reads from MinIO anymore.

## Re-enabling MinIO

If MinIO is needed again:

1. Restore the `aistor` service in `docker-compose.yml` (see git history for the exact config)
2. Install the npm package: `bun add minio`
3. Restore `lib/minio.ts` from git history (the client module with all bucket definitions and upload/download functions)
4. Ensure `.minio/minio.license` is still valid
5. Run `docker compose up -d aistor`
6. Access the console at `http://localhost:9001`
