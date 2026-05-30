# Architecture

## Stack

- **Backend:** NestJS (TypeScript), deployed on Render
- **Frontend:** Vanilla JS + HTML5 Canvas, deployed on Vercel
- **Database:** PostgreSQL on Neon (via TypeORM)
- **Cache:** Redis Cloud 30MB
- **Backups:** Vercel Blob (weekly DB dumps, see [Deployment](DEPLOYMENT.md))

## Request Flow

```
Browser
  → GET /api/pixels/snapshot  → PNG (in-process cache, 60s TTL, built from Redis pixel_grid)
  → GET /api/pixels/compact   → [x, y, color][] (interaction Map, runs in parallel)
  → WS wss://...              → real-time pixel_update / pixel_delete / batch_update events
                              → chat_send / chat_message / chat_history (live chat)
  → POST /api/pixels/batch    → authenticated, writes to Redis buffer + pixel_grid hash
```

## Canvas Rendering

Offscreen `HTMLCanvasElement` (3000×3000) holds pixel state in memory. `render()` is a single `ctx.drawImage(offscreen, ...)` call — O(1) draw calls regardless of pixel count. On WS reconnect, `loadPixels()` is re-called to resync any missed deltas.

## Write Path

```
POST /api/pixels  →  Redis pixel_buffer:{x,y} (TTL 300s)
                  →  Redis pixel_grid hash (live read source)
                  →  invalidates in-process snapshot cache
                  →  emits pixel.updated event
                  →  WS gateway broadcasts to all clients

Cron (30s)        →  flushes pixel_buffer keys → upserts into PostgreSQL pixels table
```

## Redis Keys

| Key | Type | TTL | Purpose |
|---|---|---|---|
| `pixel_grid` | Hash | none | `"x,y" → "#RRGGBB"` — live canvas state, rebuilt from Postgres on server start or if empty |
| `pixel_buffer:{x,y}` | String | 5m | Pending write, flushed to DB every 30s |
| `leaderboard` | String | 30s | Cached top-10 JSON |
| `chat:recent` | List | none | Recent chat messages, write-through to Postgres on each send |

## Database

PostgreSQL on Neon. Durable backup for canvas state and user data. Written to async via cron, never on the hot read path.

## Canvas Constraints

- Grid: 3000×3000 (x: 0–2999, y: 0–2999)
- Color: `#RRGGBB` hex string
- Auth: JWT (httpOnly cookie) required to place pixels
