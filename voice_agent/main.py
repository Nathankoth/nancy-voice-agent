import asyncio
import json
import logging
import os
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import websockets
from aiohttp import web
from dotenv import load_dotenv

from calendar_service import (
    RESERVATIONS_PATH,
    handle_function_call,
    list_reservations_async,
    update_reservation_status,
    verify_calendar_connection,
)
from datetime_context import apply_datetime_context
from conversation_end import (
    note_assistant_speech,
    note_user_speech,
    should_schedule_call_end,
)
from conversation_store import list_all_logs, persist_log
from dismissed_store import dismiss_session, list_dismissed
from summarize_service import get_session_summary, summarize_session
from supabase_service import verify_connection as verify_supabase_connection

load_dotenv()


def _disable_system_proxies() -> None:
    """Cursor injects local proxy env vars that break outbound DNS/API calls."""
    for key in list(os.environ):
        lower = key.lower()
        if lower in {
            "http_proxy",
            "https_proxy",
            "all_proxy",
            "socks_proxy",
            "socks5_proxy",
            "git_http_proxy",
            "git_https_proxy",
        } or lower.endswith("_proxy"):
            os.environ.pop(key, None)


_disable_system_proxies()

BASE_DIR = Path(__file__).parent
CONFIG_PATH = BASE_DIR / "config.json"
STATIC_DIR = BASE_DIR / "static"
LOG_DIR = BASE_DIR / "logs"
LOG_DIR.mkdir(exist_ok=True)

DEEPGRAM_AGENT_URL = "wss://agent.deepgram.com/v1/agent/converse"
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8765"))
# End call after this many seconds of silence once Nancy has finished speaking (default: 60).
SILENCE_TIMEOUT_SECONDS = int(os.getenv("SILENCE_TIMEOUT_SECONDS", "60"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(LOG_DIR / "agent.log"),
    ],
)
logger = logging.getLogger("voice_agent")


def load_config() -> dict:
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def load_agent_settings() -> dict:
    """Agent config with live date/time injected for each session."""
    return apply_datetime_context(load_config())


def save_config(config: dict) -> None:
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=4)
        f.write("\n")


def session_error_message(exc: Exception) -> str:
    msg = str(exc)
    if "401" in msg or "Unauthorized" in msg:
        return (
            "Deepgram rejected your API key (401). "
            "Update DEEPGRAM_API_KEY in voice_agent/.env and restart the server."
        )
    if "nodename nor servname" in msg or "Errno 8" in msg:
        return (
            "Network/DNS error: cannot reach Deepgram or Supabase. "
            "Check your internet connection, disable VPN/proxy, restart the server with: uv run main.py"
        )
    if "python-socks" in msg or "SOCKS proxy" in msg:
        return "Proxy error: restart the server after the latest code update: uv run main.py"
    return f"Error: {exc}"


def deepgram_connect():
    api_key = (os.getenv("DEEPGRAM_API_KEY") or "").strip().strip('"').strip("'")
    if not api_key:
        raise ValueError("DEEPGRAM_API_KEY is not set in voice_agent/.env")
    return websockets.connect(
        DEEPGRAM_AGENT_URL,
        subprotocols=["token", api_key],
        ping_interval=20,
        ping_timeout=20,
        proxy=None,  # bypass Cursor/system SOCKS proxy for Deepgram
    )


def log_event(
    category: str,
    message: str,
    extra: dict | None = None,
    session_id: str | None = None,
) -> dict:
    entry = {
        "type": "log",
        "category": category,
        "message": message,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    if extra:
        entry["extra"] = extra
    if session_id:
        entry["session_id"] = session_id
    logger.info("[%s] %s", category.upper(), message)
    return entry


async def send_json(ws, payload: dict) -> None:
    await ws.send_str(json.dumps(payload))


async def wait_for_message(dg_ws, expected_type: str) -> dict:
    async for message in dg_ws:
        if isinstance(message, str):
            data = json.loads(message)
            if data.get("type") == expected_type:
                return data
            if data.get("type") in ("Error", "Warning"):
                raise RuntimeError(f"Deepgram {data.get('type')}: {data}")
    raise RuntimeError(f"Connection closed before receiving {expected_type}")


async def end_browser_session(
    browser_ws: web.WebSocketResponse,
    session_id: str,
    reason: str,
    message: str,
) -> None:
    if browser_ws.closed:
        return
    logger.info("Session %s ended: %s", session_id, reason)
    await send_json(
        browser_ws,
        {"type": "session_end", "reason": reason, "message": message},
    )
    await send_json(
        browser_ws,
        log_event("system", message, {"reason": reason}, session_id=session_id),
    )
    await persist_log(
        log_event("system", message, {"reason": reason}, session_id=session_id), session_id
    )
    await browser_ws.close()


def new_session_activity() -> dict:
    now = time.monotonic()
    return {
        "last_meaningful_user_speech": 0.0,
        "last_agent_audio_done": now,
        "agent_speaking": False,
        "pending_end_after_audio": False,
        "asked_would_that_be_all": False,
        "customer_confirmed_done": False,
        "user_has_spoken": False,
        "user_said_goodbye": False,
        "assistant_turn_count": 0,
        "end_scheduled": False,
        "end_task": None,
        "farewell_audio_started": False,
    }


async def finish_call_after_goodbye(
    browser_ws: web.WebSocketResponse,
    session_id: str,
    activity: dict,
) -> None:
    """Wait for Nancy's farewell audio to fully finish, then hang up."""
    activity["pending_end_after_audio"] = True
    scheduled_at = time.monotonic()
    max_wait = 25.0
    farewell_started = False

    try:
        # Wait for farewell TTS to begin
        while time.monotonic() - scheduled_at < 10 and not browser_ws.closed:
            if activity.get("farewell_audio_started") or activity.get("agent_speaking"):
                farewell_started = True
                break
            await asyncio.sleep(0.1)

        # Wait until Nancy finishes speaking this farewell turn
        while time.monotonic() - scheduled_at < max_wait and not browser_ws.closed:
            if farewell_started and not activity.get("agent_speaking"):
                if activity.get("last_agent_audio_done", 0) > scheduled_at:
                    break
            elif not farewell_started and time.monotonic() - scheduled_at >= 4.0:
                break
            await asyncio.sleep(0.1)

        # Trailing buffer so the browser finishes playing buffered audio
        await asyncio.sleep(1.5)
    except asyncio.CancelledError:
        raise

    if browser_ws.closed:
        return

    activity["pending_end_after_audio"] = False
    activity["end_scheduled"] = False
    await end_browser_session(
        browser_ws,
        session_id,
        reason="conversation_complete",
        message="Thank you for calling. Goodbye!",
    )


def request_call_end(
    browser_ws: web.WebSocketResponse,
    session_id: str,
    activity: dict,
) -> None:
    if activity.get("end_scheduled"):
        return
    activity["end_scheduled"] = True
    activity["farewell_audio_started"] = activity.get("agent_speaking", False)
    prev = activity.get("end_task")
    if prev and not prev.done():
        prev.cancel()
    activity["end_task"] = asyncio.create_task(
        finish_call_after_goodbye(browser_ws, session_id, activity)
    )


def silence_anchor(activity: dict) -> float:
    """Point in time from which we measure customer silence."""
    user_at = activity["last_meaningful_user_speech"]
    agent_at = activity["last_agent_audio_done"]
    if user_at > 0:
        return max(user_at, agent_at)
    return agent_at


def note_meaningful_user_speech(activity: dict, content: str) -> None:
    text = (content or "").strip()
    if len(text) < 2:
        return
    activity["last_meaningful_user_speech"] = time.monotonic()


async def handle_function_call_request(
    dg_ws, browser_ws, data: dict, session_id: str, activity: dict
) -> None:
    for fn in data.get("functions", []):
        name = fn.get("name", "")
        client_side = fn.get("client_side", True)

        if name == "end_call":
            request_call_end(browser_ws, session_id, activity)
            if not client_side:
                await send_json(
                    browser_ws,
                    log_event("system", "Call ending (server end_call)", session_id=session_id),
                )
                continue

        if not client_side:
            continue

        fn_id = fn.get("id", "")
        raw_args = fn.get("arguments", "{}")
        try:
            arguments = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
        except json.JSONDecodeError:
            arguments = {}

        await send_json(
            browser_ws,
            log_event("system", f"Function call: {name}", {"arguments": arguments}, session_id),
        )

        result = await handle_function_call(name, arguments, session_id=session_id)
        content = json.dumps(result)

        if name in ("create_reservation", "check_availability"):
            category = "calendar"
            await send_json(
                browser_ws,
                log_event(category, result.get("message", content), {"result": result}),
            )
            if name == "create_reservation" and result.get("reservation"):
                reservation_log = LOG_DIR / "reservations_session.jsonl"
                with open(reservation_log, "a", encoding="utf-8") as f:
                    f.write(json.dumps(result["reservation"]) + "\n")

        response = {
            "type": "FunctionCallResponse",
            "id": fn_id,
            "name": name,
            "content": content,
        }
        await dg_ws.send(json.dumps(response))
        await send_json(browser_ws, log_event("system", f"Function response sent: {name}"))


def strip_markdown_for_log(text: str) -> str:
    """Plain text for voice call logs (no markdown)."""
    import re

    text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
    text = re.sub(r"\*([^*]+)\*", r"\1", text)
    text = re.sub(r"^\s*-\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"\s+-\s+", " ", text)
    return re.sub(r"\s{2,}", " ", text).strip()


def classify_event(data: dict) -> dict | None:
    event_type = data.get("type")

    if event_type == "ConversationText":
        role = data.get("role", "unknown")
        content = data.get("content", "")
        if role == "user":
            return log_event("stt", content, {"role": role})
        if role == "assistant":
            return log_event("llm", strip_markdown_for_log(content), {"role": role})

    if event_type == "AgentThinking":
        return log_event("llm", "Agent is thinking…")

    if event_type == "AgentAudioDone":
        return log_event("tts", "Agent finished speaking")

    if event_type == "UserStartedSpeaking":
        return log_event("system", "User started speaking (barge-in)")

    if event_type == "FunctionCallRequest":
        return log_event("system", "Agent requesting function call…")

    if event_type in ("Error", "Warning"):
        return log_event("system", f"{event_type}: {json.dumps(data)}")

    return None


async def bridge_browser_to_deepgram(browser_ws, dg_ws) -> None:
    try:
        async for message in browser_ws:
            if message.type == web.WSMsgType.BINARY:
                await dg_ws.send(message.data)
            elif message.type == web.WSMsgType.TEXT:
                payload = json.loads(message.data)
                if payload.get("type") == "InjectUserMessage":
                    await dg_ws.send(json.dumps(payload))
            elif message.type in (web.WSMsgType.CLOSE, web.WSMsgType.ERROR):
                break
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        logger.exception("Browser relay error: %s", exc)


async def silence_watchdog(
    browser_ws: web.WebSocketResponse,
    activity: dict,
    session_id: str,
) -> None:
    """End the session when the customer has been silent long enough after Nancy stops speaking."""
    try:
        while not browser_ws.closed:
            await asyncio.sleep(2)
            if activity.get("agent_speaking") or activity.get("pending_end_after_audio"):
                continue
            # Do not silence-timeout before the customer has spoken
            if not activity.get("user_has_spoken"):
                continue

            elapsed = time.monotonic() - silence_anchor(activity)
            if elapsed < SILENCE_TIMEOUT_SECONDS:
                continue

            await end_browser_session(
                browser_ws,
                session_id,
                reason="silence_timeout",
                message=(
                    "Call ended automatically. We did not hear you for a while. "
                    "Tap Talk to Nancy to start again."
                ),
            )
            break
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        logger.exception("Silence watchdog error: %s", exc)


async def bridge_deepgram_to_browser(
    browser_ws, dg_ws, session_id: str, activity: dict
) -> None:
    tts_bytes = 0
    try:
        async for message in dg_ws:
            if isinstance(message, bytes):
                tts_bytes += len(message)
                activity["agent_speaking"] = True
                if activity.get("end_scheduled"):
                    activity["farewell_audio_started"] = True
                await browser_ws.send_bytes(message)
                continue

            data = json.loads(message)
            event_type = data.get("type")

            if event_type == "AgentThinking":
                activity["agent_speaking"] = True

            if event_type == "ConversationText":
                role = data.get("role")
                content = data.get("content", "")
                if role == "user":
                    note_meaningful_user_speech(activity, content)
                    note_user_speech(activity, content)
                elif role == "assistant":
                    note_assistant_speech(activity, content)
                    if should_schedule_call_end(activity, content):
                        request_call_end(browser_ws, session_id, activity)

            if event_type == "FunctionCallRequest":
                log_entry = classify_event(data)
                if log_entry:
                    log_entry["session_id"] = session_id
                    await send_json(browser_ws, log_entry)
                    await persist_log(log_entry, session_id)
                await handle_function_call_request(dg_ws, browser_ws, data, session_id, activity)
                await send_json(browser_ws, {"type": "agent_event", "event": data})
                continue

            log_entry = classify_event(data)
            if log_entry:
                log_entry["session_id"] = session_id
                await send_json(browser_ws, log_entry)
                await persist_log(log_entry, session_id)

            if event_type == "AgentAudioDone":
                activity["agent_speaking"] = False
                activity["last_agent_audio_done"] = time.monotonic()
                if tts_bytes:
                    await send_json(
                        browser_ws,
                        log_event("tts", f"Played {tts_bytes} bytes of agent audio"),
                    )
                    tts_bytes = 0
                continue

            await send_json(browser_ws, {"type": "agent_event", "event": data})
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        logger.exception("Deepgram relay error: %s", exc)


async def browser_handler(request: web.Request) -> web.WebSocketResponse:
    browser_ws = web.WebSocketResponse()
    await browser_ws.prepare(request)

    session_id = str(uuid.uuid4())
    await send_json(browser_ws, log_event("system", "Browser connected", session_id=session_id))
    await persist_log(
        log_event("system", "Browser connected", session_id=session_id), session_id
    )

    try:
        async with deepgram_connect() as dg_ws:
            welcome = await wait_for_message(dg_ws, "Welcome")
            await send_json(
                browser_ws,
                log_event("system", f"Deepgram connected ({welcome.get('request_id', 'n/a')})"),
            )

            settings = load_agent_settings()
            await dg_ws.send(json.dumps(settings))
            await wait_for_message(dg_ws, "SettingsApplied")
            await send_json(browser_ws, {"type": "ready", "config": settings})
            await send_json(browser_ws, log_event("system", "Agent ready. Start speaking."))

            activity = new_session_activity()

            cal_status = await verify_calendar_connection()
            if cal_status.get("ok"):
                await send_json(
                    browser_ws,
                    log_event(
                        "calendar",
                        f"Google Calendar connected ({cal_status.get('summary')})",
                        cal_status,
                    ),
                )
            else:
                await send_json(
                    browser_ws,
                    log_event(
                        "calendar",
                        f"Calendar: {cal_status.get('error', 'not connected')}. Reservations saved locally",
                        cal_status,
                        session_id,
                    ),
                )

            sb_status = await verify_supabase_connection()
            if sb_status.get("ok"):
                await send_json(
                    browser_ws,
                    log_event(
                        "system",
                        f"Supabase connected ({sb_status.get('url')})",
                        sb_status,
                        session_id,
                    ),
                )
            else:
                await send_json(
                    browser_ws,
                    log_event(
                        "system",
                        f"Supabase: {sb_status.get('error', 'not connected')}",
                        sb_status,
                        session_id,
                    ),
                )

            browser_task = asyncio.create_task(bridge_browser_to_deepgram(browser_ws, dg_ws))
            deepgram_task = asyncio.create_task(
                bridge_deepgram_to_browser(browser_ws, dg_ws, session_id, activity)
            )
            watchdog_task = asyncio.create_task(
                silence_watchdog(browser_ws, activity, session_id)
            )

            done, pending = await asyncio.wait(
                [browser_task, deepgram_task, watchdog_task],
                return_when=asyncio.FIRST_COMPLETED,
            )
            for task in pending:
                task.cancel()
            await asyncio.gather(*pending, return_exceptions=True)

    except Exception as exc:
        logger.exception("Session error: %s", exc)
        await send_json(browser_ws, log_event("system", session_error_message(exc), session_id=session_id))

    asyncio.create_task(_summarize_session_on_end(session_id))

    await send_json(browser_ws, log_event("system", "Session ended"))
    return browser_ws


async def _summarize_session_on_end(session_id: str) -> None:
    try:
        reservation = None
        for row in await list_reservations_async():
            if row.get("session_id") == session_id:
                reservation = row
                break
        await summarize_session(session_id, reservation)
    except Exception as exc:
        logger.warning("Session summary failed for %s: %s", session_id, exc)


async def get_config(_request: web.Request) -> web.Response:
    return web.json_response(load_config())


async def put_config(request: web.Request) -> web.Response:
    try:
        config = await request.json()
    except json.JSONDecodeError:
        return web.json_response({"error": "Invalid JSON"}, status=400)

    if config.get("type") != "Settings":
        return web.json_response({"error": "Config must have type 'Settings'"}, status=400)

    save_config(config)
    logger.info("Config updated via API")
    return web.json_response({"ok": True, "config": config})


async def get_reservations(_request: web.Request) -> web.Response:
    return web.json_response(await list_reservations_async())


async def patch_reservation(request: web.Request) -> web.Response:
    reservation_id = request.match_info.get("id", "")
    try:
        body = await request.json()
    except json.JSONDecodeError:
        return web.json_response({"error": "Invalid JSON"}, status=400)

    status = body.get("status", "")
    result = await update_reservation_status(reservation_id, status)
    if not result.get("success"):
        return web.json_response(result, status=404)
    return web.json_response(result)


async def get_supabase_status(_request: web.Request) -> web.Response:
    return web.json_response(await verify_supabase_connection())


async def get_logs(request: web.Request) -> web.Response:
    session_id = request.query.get("session_id")
    limit = int(request.query.get("limit", "100"))
    logs = await list_all_logs(session_id=session_id, limit=limit)
    return web.json_response(logs)


async def get_dismissed_sessions(_request: web.Request) -> web.Response:
    return web.json_response({"dismissed": list_dismissed()})


async def dismiss_session_handler(request: web.Request) -> web.Response:
    session_id = request.match_info.get("session_id", "")
    if not session_id:
        return web.json_response({"error": "session_id required"}, status=400)
    dismiss_session(session_id)
    return web.json_response({"success": True, "session_id": session_id})


async def get_session_summary_handler(request: web.Request) -> web.Response:
    session_id = request.match_info.get("session_id", "")
    if not session_id:
        return web.json_response({"error": "session_id required"}, status=400)

    reservation = None
    for row in await list_reservations_async():
        if row.get("session_id") == session_id:
            reservation = row
            break

    result = await get_session_summary(session_id, reservation)
    return web.json_response(result)


async def get_calendar_status(_request: web.Request) -> web.Response:
    status = await verify_calendar_connection()
    return web.json_response(status)


async def health(_request: web.Request) -> web.Response:
    return web.json_response({"ok": True})


async def index(_request: web.Request) -> web.FileResponse:
    return web.FileResponse(STATIC_DIR / "index.html")


@web.middleware
async def cors_middleware(request: web.Request, handler):
    """Allow browser requests from the Next.js app (different port)."""
    if request.method == "OPTIONS":
        response = web.Response()
    else:
        response = await handler(request)

    origin = request.headers.get("Origin", "")
    allowed = (
        origin.startswith("http://localhost:")
        or origin.startswith("http://127.0.0.1:")
        or origin.endswith(".vercel.app")
    )
    if allowed or not origin:
        response.headers["Access-Control-Allow-Origin"] = origin or "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, PUT, POST, PATCH, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


def create_app() -> web.Application:
    app = web.Application(middlewares=[cors_middleware])
    app.router.add_get("/health", health)
    app.router.add_get("/", index)
    app.router.add_get("/api/config", get_config)
    app.router.add_put("/api/config", put_config)
    app.router.add_get("/api/reservations", get_reservations)
    app.router.add_patch("/api/reservations/{id}", patch_reservation)
    app.router.add_get("/api/logs", get_logs)
    app.router.add_get("/api/dismissed-sessions", get_dismissed_sessions)
    app.router.add_post("/api/sessions/{session_id}/dismiss", dismiss_session_handler)
    app.router.add_get("/api/sessions/{session_id}/summary", get_session_summary_handler)
    app.router.add_get("/api/supabase/status", get_supabase_status)
    app.router.add_get("/api/calendar/status", get_calendar_status)
    app.router.add_get("/ws", browser_handler)
    app.router.add_static("/static/", STATIC_DIR, name="static")
    return app


def main() -> None:
    RESERVATIONS_PATH.touch(exist_ok=True)
    if RESERVATIONS_PATH.stat().st_size == 0:
        RESERVATIONS_PATH.write_text("[]\n", encoding="utf-8")

    app = create_app()
    logger.info("Voice agent server at http://%s:%s", HOST, PORT)
    web.run_app(app, host=HOST, port=PORT, print=lambda msg: logger.info(msg.strip()))


if __name__ == "__main__":
    main()
