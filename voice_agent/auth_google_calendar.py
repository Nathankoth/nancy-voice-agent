"""One-time OAuth setup for Google Calendar write access.

Run: uv run auth_google_calendar.py

Requires in .env:
  GOOGLE_CLIENT_ID
  GOOGLE_CLIENT_SECRET

Adds GOOGLE_REFRESH_TOKEN to .env after you sign in.
"""

import json
import os
import urllib.parse
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import aiohttp
from dotenv import load_dotenv

load_dotenv()

ENV_PATH = Path(__file__).parent / ".env"
REDIRECT_URI = "http://localhost:8090/oauth/callback"
SCOPES = "https://www.googleapis.com/auth/calendar"
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"


class OAuthHandler(BaseHTTPRequestHandler):
    code: str | None = None

    def do_GET(self):
        query = urllib.parse.urlparse(self.path).query
        params = urllib.parse.parse_qs(query)
        OAuthHandler.code = params.get("code", [None])[0]
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.end_headers()
        self.wfile.write(b"<h1>Authorization complete. You can close this tab.</h1>")

    def log_message(self, format, *args):
        pass


def update_env(key: str, value: str) -> None:
    lines = []
    if ENV_PATH.exists():
        lines = ENV_PATH.read_text(encoding="utf-8").splitlines()

    updated = False
    for i, line in enumerate(lines):
        if line.startswith(f"{key}="):
            lines[i] = f'{key}="{value}"'
            updated = True
            break
    if not updated:
        lines.append(f'{key}="{value}"')
    ENV_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


async def exchange_code(code: str) -> dict:
    async with aiohttp.ClientSession() as session:
        async with session.post(
            TOKEN_URL,
            data={
                "code": code,
                "client_id": os.environ["GOOGLE_CLIENT_ID"],
                "client_secret": os.environ["GOOGLE_CLIENT_SECRET"],
                "redirect_uri": REDIRECT_URI,
                "grant_type": "authorization_code",
            },
        ) as resp:
            return await resp.json()


def main():
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
    if not client_id or not client_secret:
        print("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first.")
        print("Create OAuth credentials at: https://console.cloud.google.com/apis/credentials")
        return

    params = urllib.parse.urlencode(
        {
            "client_id": client_id,
            "redirect_uri": REDIRECT_URI,
            "response_type": "code",
            "scope": SCOPES,
            "access_type": "offline",
            "prompt": "consent",
        }
    )
    url = f"{AUTH_URL}?{params}"
    print("Opening browser for Google sign-in…")
    print(url)
    webbrowser.open(url)

    server = HTTPServer(("localhost", 8090), OAuthHandler)
    server.handle_request()

    if not OAuthHandler.code:
        print("No authorization code received.")
        return

    import asyncio

    tokens = asyncio.run(exchange_code(OAuthHandler.code))
    if "refresh_token" not in tokens:
        print("Response:", json.dumps(tokens, indent=2))
        print("No refresh_token — revoke app access and run again with prompt=consent.")
        return

    update_env("GOOGLE_REFRESH_TOKEN", tokens["refresh_token"])
    print("Saved GOOGLE_REFRESH_TOKEN to .env")
    print("Calendar sync is now enabled for reservations.")


if __name__ == "__main__":
    main()
