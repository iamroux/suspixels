# Deployment

## Live Stack

| Service | Platform | Notes |
|---|---|---|
| Frontend | Vercel | `pixels.iamroux.xyz` (raw deploy: `frontend-swart-eight-bwf2ihn18r.vercel.app`) |
| Backend / WS | Render (free tier) | `suspixels-api.onrender.com` — kept warm by UptimeRobot every 5 min |
| Database | Neon (PostgreSQL) | No expiry, pooled connection with `sslmode=require` |
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
DATABASE_URL=postgresql://...@neon.tech/neondb?sslmode=require
DATABASE_SSL_ENABLED=true
DATABASE_SYNCHRONIZE=true
REDIS_URL=redis://default:...@redis-cloud:15545
APP_CORS_ORIGINS=https://<vercel-domain>
```

## DB Operations

A GitHub Actions workflow (`.github/workflows/db-backup.yml`) runs a weekly
`pg_dump` and uploads it to **Vercel Blob** (private store, keeps the last 3).
Requires the `BLOB_READ_WRITE_TOKEN` GitHub Actions secret.

Manual backup / restore:

```bash
# Backup
pg_dump "DATABASE_URL" --no-owner --no-acl -f backup.sql

# Restore
psql "DATABASE_URL" -f backup.sql

# Restore a gzipped backup pulled from Vercel Blob
gunzip -c backup_YYYY-MM-DD.sql.gz | psql "DATABASE_URL"
```
