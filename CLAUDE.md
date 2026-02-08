# Desert Services Hub

## Remote Database Access (gmk-server)

The Supabase stack runs on `gmk-server`. Access from any machine on Tailscale:

### Direct psql

```bash
psql -h gmk-server -p 54322 -U postgres
# Password: postgres
```

### SSH + docker exec

```bash
ssh gmk-server "docker exec supabase_db_desert-services-hub psql -U postgres -c 'YOUR SQL HERE'"
```

### Supabase Studio (web UI)

```text
http://gmk-server:54323
```

### Supabase API (PostgREST)

```text
http://gmk-server:54321
```

**Do NOT try to run `docker exec` locally** — the containers are on gmk-server, not your local machine.
