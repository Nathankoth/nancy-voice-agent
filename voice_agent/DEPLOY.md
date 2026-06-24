# Deploy voice_agent on Railway

Railway must build from the **`voice_agent`** folder, not the repo root.

## Railway settings

1. Create a service from this GitHub repo.
2. Open **Settings → Source → Root Directory**.
3. Set root directory to: `voice_agent`
4. Redeploy.

## Start command

Default (from `railway.toml`):

```bash
python main.py
```

## Required env vars

- `DEEPGRAM_API_KEY`
- `PORT` (Railway injects this automatically)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESTAURANT_TIMEZONE` (e.g. `Africa/Lagos`)

Optional: `OPENAI_API_KEY`, Google Calendar keys.

## Health check

After deploy, open:

`https://YOUR-RAILWAY-URL.up.railway.app/health`

Expected: `{"status":"ok"}`

## Vercel (frontend)

Deploy the `nancy/` folder separately on Vercel and set:

- `NANCY_BACKEND_URL=https://YOUR-RAILWAY-URL.up.railway.app`
- `NEXT_PUBLIC_NANCY_WS_URL=wss://YOUR-RAILWAY-URL.up.railway.app/ws`
