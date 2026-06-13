import asyncio
import json
import logging
import os
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
    verify_calendar_connection,
)
from supabase_service import (
    insert_conversation_log,
    is_configured as supabase_configured,
    list_conversation_logs,
    verify_connection as verify_supabase_connection,
)

load_dotenv()

BASE_DIR = Path(__file__).parent
CONFIG_PATH = BASE_DIR / "config.json"
STATIC_DIR = BASE_DIR / "static"
LOG_DIR = BASE_DIR / "logs"
LOG_DIR.mkdir(exist_ok=True)

DEEPGRAM_AGENT_URL = "wss://agent.deepgram.com/v1/agent/converse"
HOST = "localhost"
PORT = 8765

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


def save_config(config: dict) -> None:
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=4)
        f.write("\n")


def deepgram_connect():
    api_key = os.getenv("DEEPGRAM_API_KEY")
    if not api_key:
        raise ValueError("DEEPGRAM_API_KEY is not set")
    return websockets.connect(
        DEEPGRAM_AGENT_URL,
        subprotocols=["token", api_key],
        ping_interval=20,
        ping_timeout=20,
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


async def persist_log(entry: dict, session_id: str | None) -> None:
    if not supabase_configured():
        return
    await insert_conversation_log(
        category=entry.get("category", "system"),
        message=entry.get("message", ""),
        session_id=session_id,
        metadata=entry.get("extra"),
    )


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


async def handle_function_call_request(
    dg_ws, browser_ws, data: dict, session_id: str
) -> None:
    for fn in data.get("functions", []):
        if not fn.get("client_side", True):
            continue

        name = fn.get("name", "")
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


def classify_event(data: dict) -> dict | None:
    event_type = data.get("type")

    if event_type == "ConversationText":
        role = data.get("role", "unknown")
        content = data.get("content", "")
        if role == "user":
            return log_event("stt", content, {"role": role})
        if role == "assistant":
            return log_event("llm", content, {"role": role})

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


async def bridge_deepgram_to_browser(browser_ws, dg_ws, session_id: str) -> None:
    tts_bytes = 0
    try:
        async for message in dg_ws:
            if isinstance(message, bytes):
                tts_bytes += len(message)
                await browser_ws.send_bytes(message)
                continue

            data = json.loads(message)
            event_type = data.get("type")

            if event_type == "FunctionCallRequest":
                log_entry = classify_event(data)
                if log_entry:
                    log_entry["session_id"] = session_id
                    await send_json(browser_ws, log_entry)
                    await persist_log(log_entry, session_id)
                await handle_function_call_request(dg_ws, browser_ws, data, session_id)
                await send_json(browser_ws, {"type": "agent_event", "event": data})
                continue

            log_entry = classify_event(data)
            if log_entry:
                log_entry["session_id"] = session_id
                await send_json(browser_ws, log_entry)
                await persist_log(log_entry, session_id)

            if event_type == "AgentAudioDone" and tts_bytes:
                await send_json(
                    browser_ws,
                    log_event("tts", f"Played {tts_bytes} bytes of agent audio"),
                )
                tts_bytes = 0

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

            settings = load_config()
            await dg_ws.send(json.dumps(settings))
            await wait_for_message(dg_ws, "SettingsApplied")
            await send_json(browser_ws, {"type": "ready", "config": settings})
            await send_json(browser_ws, log_event("system", "Agent ready — start speaking"))

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
                        f"Calendar: {cal_status.get('error', 'not connected')} — reservations saved locally",
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
                bridge_deepgram_to_browser(browser_ws, dg_ws, session_id)
            )

            done, pending = await asyncio.wait(
                [browser_task, deepgram_task],
                return_when=asyncio.FIRST_COMPLETED,
            )
            for task in pending:
                task.cancel()
            await asyncio.gather(*pending, return_exceptions=True)

    except Exception as exc:
        logger.exception("Session error: %s", exc)
        await send_json(browser_ws, log_event("system", f"Error: {exc}"))

    await send_json(browser_ws, log_event("system", "Session ended"))
    return browser_ws


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


async def get_supabase_status(_request: web.Request) -> web.Response:
    return web.json_response(await verify_supabase_connection())


async def get_logs(request: web.Request) -> web.Response:
    session_id = request.query.get("session_id")
    limit = int(request.query.get("limit", "100"))
    logs = await list_conversation_logs(session_id=session_id, limit=limit)
    return web.json_response(logs)


async def get_calendar_status(_request: web.Request) -> web.Response:
    status = await verify_calendar_connection()
    return web.json_response(status)


async def index(_request: web.Request) -> web.FileResponse:
    return web.FileResponse(STATIC_DIR / "index.html")


def create_app() -> web.Application:
    app = web.Application()
    app.router.add_get("/", index)
    app.router.add_get("/api/config", get_config)
    app.router.add_put("/api/config", put_config)
    app.router.add_get("/api/reservations", get_reservations)
    app.router.add_get("/api/logs", get_logs)
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
