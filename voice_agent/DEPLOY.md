# Deploy voice_agent on Railway

## Railway settings (required)

1. Create a service from this GitHub repo.
2. **Settings → Source → Root Directory** → set to: `voice_agent`
3. **Settings → Build → Builder** → **Nixpacks** (not Dockerfile)
4. Redeploy.

Nixpacks will detect Python from `requirements.txt` / `pyproject.toml` and run the app.

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
