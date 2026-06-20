# Deployment

## Live Stack

| Service | Platform | Notes |
|---|---|---|
| Frontend | Vercel | `pixels.iamroux.xyz` (raw deploy: `frontend-swart-eight-bwf2ihn18r.vercel.app`) |
| Backend / WS | Render (free tier) | `suspixels-api.onrender.com` — kept warm by UptimeRobot every 5 min |
| Database | Supabase (PostgreSQL) | Session pooler (port 5432), SSL required; `uuid-ossp` extension lives in the `public` schema |
| Cache | Redis Cloud | 30MB free instance |
| Backups | Vercel Blob | Weekly DB dumps, private store, last 3 retained |

## Deploying Changes

**Frontend** (`frontend/` changes):
```bash
git push
cd frontend && vercel --prod --yes
```

**Backend** (`src/` changes):
```bash
git push  # Render auto-deploys from main
```

## Test Locally

Frontend against live backend:
```bash
lsof -ti :5005 | xargs kill -9 2>/dev/null
cd frontend && python3 -m http.server 5005 --bind 0.0.0.0
# open http://localhost:5005
```

## Key Env Vars (Render)

```
NODE_ENV=production
# Supabase session pooler. URL-encode reserved chars in the password (e.g. @ -> %40).
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-1-<region>.pooler.supabase.com:5432/postgres
DATABASE_SSL_ENABLED=true
DATABASE_REJECT_UNAUTHORIZED=false
DATABASE_SYNCHRONIZE=true
REDIS_URL=redis://default:...@redis-cloud:15545
APP_CORS_ORIGINS=https://<vercel-domain>
```

> **Supabase notes:** use the **Session pooler** (port 5432), not the Transaction
> pooler (6543) — the latter breaks TypeORM's prepared statements. The app's
> UUID PKs need `uuid_generate_v4()` resolvable in `public`, so the `uuid-ossp`
> extension was moved there (`ALTER EXTENSION "uuid-ossp" SET SCHEMA public`).

## DB Operations

A GitHub Actions workflow (`.github/workflows/db-backup.yml`) runs a weekly
`pg_dump --schema=public` and uploads it to **Vercel Blob** (private store, keeps
the last 3). The `--schema=public` is required so the dump excludes Supabase's
internal `auth`/`storage`/`realtime` schemas. Requires the `DATABASE_URL` and
`BLOB_READ_WRITE_TOKEN` GitHub Actions secrets.

Manual backup / restore:

```bash
# Backup (public schema only, portable across providers)
pg_dump "DATABASE_URL" --schema=public --no-owner --no-privileges -f backup.sql

# Restore — into a fresh DB, ensure uuid-ossp is available in public FIRST,
# else CREATE TABLE fails on the uuid_generate_v4() default:
psql "DATABASE_URL" -c 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;'
psql "DATABASE_URL" -f backup.sql

# Restore a gzipped backup pulled from Vercel Blob
gunzip -c backup_YYYY-MM-DD.sql.gz | psql "DATABASE_URL"
```
