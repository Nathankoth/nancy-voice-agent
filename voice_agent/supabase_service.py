"""Supabase REST API persistence for reservations and conversation logs."""

from __future__ import annotations

import logging
import os
import re
import uuid

import aiohttp

logger = logging.getLogger("voice_agent.supabase")

RESERVATIONS_TABLE = "reservations"
LOGS_TABLE = "conversation_logs"


def _project_url_from_postgres() -> str | None:
    for key in ("SUPABASE_SESSION_POSTGRES_URL", "SUPABASE_TRANSACTION_POSTGRES_URL"):
        url = os.getenv(key, "")
        match = re.search(r"postgres\.([a-z0-9]+):", url)
        if match:
            return f"https://{match.group(1)}.supabase.co"
    return None


def supabase_url() -> str | None:
    return os.getenv("SUPABASE_URL") or _project_url_from_postgres()


def supabase_key() -> str | None:
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
    if key and key.strip():
        return key.strip()
    return None


def is_configured() -> bool:
    return bool(supabase_url() and supabase_key())


def _headers() -> dict[str, str]:
    key = supabase_key()
    if not key:
        raise RuntimeError("Supabase not configured")
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def _rest_url(table: str) -> str:
    return f"{supabase_url()}/rest/v1/{table}"


async def verify_connection() -> dict:
    if not is_configured():
        return {
            "ok": False,
            "error": "Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) in .env",
            "hint": "Supabase Dashboard → Project Settings → API",
        }
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                _rest_url(RESERVATIONS_TABLE),
                headers=_headers(),
                params={"select": "id", "limit": "1"},
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return {
                        "ok": True,
                        "url": supabase_url(),
                        "tables": [RESERVATIONS_TABLE, LOGS_TABLE],
                        "sample_count": len(data),
                    }
                body = await resp.text()
                hint = "Run supabase/schema.sql in the Supabase SQL Editor"
                if resp.status == 401:
                    hint = "Check SUPABASE_SERVICE_ROLE_KEY in .env"
                if "relation" in body and "does not exist" in body:
                    hint = "Run supabase/schema.sql to create tables"
                return {"ok": False, "status": resp.status, "error": body, "hint": hint}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


async def insert_reservation(record: dict) -> dict:
    row = {
        "id": record.get("id", str(uuid.uuid4())),
        "created_at": record.get("created_at"),
        "guest_name": record["guest_name"],
        "phone": record["phone"],
        "date": record["date"],
        "time": record["time"],
        "guests": record["guests"],
        "special_requests": record.get("special_requests", ""),
        "start_at": record.get("start_at"),
        "end_at": record.get("end_at"),
        "timezone": record.get("timezone", "Africa/Lagos"),
        "status": record.get("status", "confirmed"),
        "calendar_event_id": record.get("calendar_event_id"),
        "calendar_synced": record.get("calendar_synced", False),
        "calendar_link": record.get("calendar_link"),
        "decline_reason": record.get("decline_reason"),
        "calendar_sync_error": record.get("calendar_sync_error"),
        "session_id": record.get("session_id"),
    }
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                _rest_url(RESERVATIONS_TABLE), headers=_headers(), json=row
            ) as resp:
                if resp.status in (200, 201):
                    record["supabase_synced"] = True
                else:
                    body = await resp.text()
                    record["supabase_synced"] = False
                    record["supabase_sync_error"] = body
                    logger.warning("Supabase reservation insert failed (%s): %s", resp.status, body)
    except Exception as exc:
        logger.exception("Supabase reservation insert failed: %s", exc)
        record["supabase_synced"] = False
        record["supabase_sync_error"] = str(exc)
    return record


async def list_reservations_from_db() -> list[dict]:
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                _rest_url(RESERVATIONS_TABLE),
                headers=_headers(),
                params={"select": "*", "order": "created_at.desc"},
            ) as resp:
                if resp.status == 200:
                    return await resp.json()
                logger.warning("Supabase list reservations failed (%s)", resp.status)
    except Exception as exc:
        logger.exception("Supabase list reservations failed: %s", exc)
    return []


async def find_conflicts(date: str, time: str) -> list[dict]:
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                _rest_url(RESERVATIONS_TABLE),
                headers=_headers(),
                params={
                    "select": "*",
                    "date": f"eq.{date}",
                    "time": f"eq.{time}",
                    "status": "neq.cancelled",
                },
            ) as resp:
                if resp.status == 200:
                    return await resp.json()
    except Exception as exc:
        logger.warning("Supabase conflict check failed: %s", exc)
    return []


async def insert_conversation_log(
    category: str,
    message: str,
    session_id: str | None = None,
    metadata: dict | None = None,
) -> None:
    if not is_configured():
        return
    row = {
        "category": category,
        "message": message,
        "session_id": session_id,
        "metadata": metadata or {},
    }
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                _rest_url(LOGS_TABLE), headers=_headers(), json=row
            ) as resp:
                if resp.status not in (200, 201):
                    body = await resp.text()
                    logger.warning("Supabase log insert failed (%s): %s", resp.status, body)
    except Exception as exc:
        logger.warning("Supabase log insert failed: %s", exc)


async def list_conversation_logs(session_id: str | None = None, limit: int = 100) -> list[dict]:
    if not is_configured():
        return []
    params: dict[str, str] = {
        "select": "*",
        "order": "created_at.desc",
        "limit": str(limit),
    }
    if session_id:
        params["session_id"] = f"eq.{session_id}"
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                _rest_url(LOGS_TABLE), headers=_headers(), params=params
            ) as resp:
                if resp.status == 200:
                    return await resp.json()
    except Exception as exc:
        logger.exception("Supabase list logs failed: %s", exc)
    return []
