# Nancy — Voice Agent for XYZ Restaurant

Real-time voice receptionist powered by Deepgram Agent API, with reservation booking, Google Calendar sync, and Supabase persistence.

## Structure

```
voice_agent/   Python WebSocket server + Deepgram bridge (port 8765)
nancy/         Next.js voice UI + admin dashboard (port 3000)
```

## Deploy

- **Railway (backend):** see `voice_agent/DEPLOY.md` — set Root Directory to `voice_agent`, or use the root `Dockerfile`.
- **Vercel (frontend):** deploy `nancy/` with Root Directory `nancy`.

## Quick start

### 1. Python backend

```bash
cd voice_agent
cp .env.example .env   # add DEEPGRAM_API_KEY and optional Supabase/Calendar keys
uv sync
uv run main.py
```

Server: http://localhost:8765

### 2. Next.js frontend

```bash
cd nancy
npm install
npm run dev
```

App: http://localhost:3000  
Admin: http://localhost:3000/admin

## Environment variables

See `voice_agent/.env.example` for backend keys and `nancy/.env.local` for frontend URLs.
