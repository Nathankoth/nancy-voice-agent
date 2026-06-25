"""Google Calendar + local reservation storage for the voice agent."""

from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import aiohttp

from supabase_service import (
    find_conflicts as supabase_find_conflicts,
    insert_reservation as supabase_insert_reservation,
    is_configured as supabase_configured,
    list_reservations_from_db,
    update_reservation_in_db,
)

logger = logging.getLogger("voice_agent.calendar")

BASE_DIR = Path(__file__).parent
RESERVATIONS_PATH = BASE_DIR / "logs" / "reservations.json"
RESERVATIONS_PATH.parent.mkdir(exist_ok=True)

CALENDAR_API = "https://www.googleapis.com/calendar/v3"
TOKEN_URL = "https://oauth2.googleapis.com/token"

DEFAULT_DURATION_HOURS = 2


def _session() -> aiohttp.ClientSession:
    return aiohttp.ClientSession(trust_env=False)


def _calendar_id() -> str:
    return os.getenv("GOOGLE_CALENDAR_ID", "primary")


def _timezone() -> str:
    return os.getenv("GOOGLE_CALENDAR_TIMEZONE", "UTC")


def _api_key() -> str | None:
    return os.getenv("GOOGLE_CALENDAR_API_KEY")


def _oauth_configured() -> bool:
    return all(
        os.getenv(k)
        for k in (
            "GOOGLE_CLIENT_ID",
            "GOOGLE_CLIENT_SECRET",
            "GOOGLE_REFRESH_TOKEN",
        )
    )


def _load_reservations() -> list[dict]:
    if not RESERVATIONS_PATH.exists():
        return []
    with open(RESERVATIONS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def list_reservations() -> list[dict]:
    return _load_reservations()


async def list_reservations_async() -> list[dict]:
    if supabase_configured():
        db_rows = await list_reservations_from_db()
        if db_rows:
            return db_rows
    return _load_reservations()


async def update_reservation_status(reservation_id: str, status: str) -> dict:
    """Mark reservation served or cancelled — removes from active admin table."""
    if status not in {"served", "cancelled"}:
        return {"success": False, "message": "Status must be served or cancelled"}

    record: dict | None = None

    if supabase_configured():
        record = await update_reservation_in_db(reservation_id, status)

    reservations = _load_reservations()
    for r in reservations:
        if r.get("id") == reservation_id:
            r["status"] = status
            r["updated_at"] = datetime.now(timezone.utc).isoformat()
            record = record or r
            _save_reservations(reservations)
            break

    if not record:
        return {"success": False, "message": "Reservation not found"}

    label = "served" if status == "served" else "cancelled"
    return {
        "success": True,
        "message": f"Reservation marked as {label}",
        "reservation": record,
    }


def _save_reservations(reservations: list[dict]) -> None:
    with open(RESERVATIONS_PATH, "w", encoding="utf-8") as f:
        json.dump(reservations, f, indent=2)
        f.write("\n")


def _parse_reservation_times(date: str, time: str) -> tuple[datetime, datetime]:
    tz = ZoneInfo(_timezone())
    start_naive = datetime.strptime(f"{date} {time}", "%Y-%m-%d %H:%M")
    start = start_naive.replace(tzinfo=tz)
    end = start + timedelta(hours=DEFAULT_DURATION_HOURS)
    return start, end


def _format_google_datetime(dt: datetime) -> str:
    return dt.isoformat()


async def _get_access_token(session: aiohttp.ClientSession) -> str | None:
    if not _oauth_configured():
        return None

    async with session.post(
        TOKEN_URL,
        data={
            "client_id": os.environ["GOOGLE_CLIENT_ID"],
            "client_secret": os.environ["GOOGLE_CLIENT_SECRET"],
            "refresh_token": os.environ["GOOGLE_REFRESH_TOKEN"],
            "grant_type": "refresh_token",
        },
    ) as resp:
        if resp.status != 200:
            body = await resp.text()
            logger.error("OAuth token refresh failed (%s): %s", resp.status, body)
            return None
        data = await resp.json()
        return data.get("access_token")


async def _calendar_headers(session: aiohttp.ClientSession) -> dict[str, str] | None:
    token = await _get_access_token(session)
    if token:
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    api_key = _api_key()
    if api_key:
        return {"Content-Type": "application/json"}

    return None


def _calendar_url(path: str, access_via_oauth: bool) -> str:
    url = f"{CALENDAR_API}{path}"
    if not access_via_oauth and _api_key():
        return f"{url}?key={_api_key()}"
    return url


async def verify_calendar_connection() -> dict:
    async with _session() as session:
        token = await _get_access_token(session)
        use_oauth = bool(token)
        headers = await _calendar_headers(session)
        if not headers:
            return {"ok": False, "error": "No Google Calendar credentials configured"}

        url = _calendar_url(f"/calendars/{_calendar_id()}", use_oauth)
        async with session.get(url, headers=headers) as resp:
            body = await resp.json()
            if resp.status != 200:
                return {
                    "ok": False,
                    "status": resp.status,
                    "error": body.get("error", {}).get("message", str(body)),
                    "hint": "Private calendars need OAuth. Run: uv run auth_google_calendar.py",
                }
            return {
                "ok": True,
                "calendar_id": body.get("id"),
                "summary": body.get("summary"),
                "timeZone": body.get("timeZone"),
                "auth": "oauth" if use_oauth else "api_key",
            }


async def check_availability(date: str, time: str, guests: int = 2) -> dict:
    start, end = _parse_reservation_times(date, time)

    conflicts = []
    if supabase_configured():
        conflicts = await supabase_find_conflicts(date, time)
    if not conflicts:
        for r in _load_reservations():
            if r.get("status") == "cancelled":
                continue
            if r.get("date") == date and r.get("time") == time:
                conflicts.append(r)

    calendar_busy = False
    async with _session() as session:
        token = await _get_access_token(session)
        if token:
            headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
            payload = {
                "timeMin": _format_google_datetime(start),
                "timeMax": _format_google_datetime(end),
                "timeZone": _timezone(),
                "items": [{"id": _calendar_id()}],
            }
            async with session.post(f"{CALENDAR_API}/freeBusy", json=payload, headers=headers) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    busy = data.get("calendars", {}).get(_calendar_id(), {}).get("busy", [])
                    calendar_busy = len(busy) > 0

    available = not conflicts and not calendar_busy
    return {
        "available": available,
        "date": date,
        "time": time,
        "guests": guests,
        "start_at": start.isoformat(),
        "end_at": end.isoformat(),
        "local_conflicts": len(conflicts),
        "calendar_busy": calendar_busy,
        "message": "Slot is available" if available else "That time slot is already booked",
    }


async def create_reservation(
    guest_name: str,
    phone: str,
    date: str,
    time: str,
    guests: int,
    special_requests: str = "",
    session_id: str | None = None,
) -> dict:
    start, end = _parse_reservation_times(date, time)
    reservation_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()

    record = {
        "id": reservation_id,
        "created_at": created_at,
        "guest_name": guest_name,
        "phone": phone,
        "date": date,
        "time": time,
        "guests": guests,
        "special_requests": special_requests or "",
        "start_at": start.isoformat(),
        "end_at": end.isoformat(),
        "timezone": _timezone(),
        "status": "confirmed",
        "calendar_event_id": None,
        "calendar_synced": False,
        "calendar_link": None,
        "session_id": session_id,
    }

    availability = await check_availability(date, time, guests)
    if not availability["available"]:
        record["status"] = "declined"
        record["decline_reason"] = availability["message"]
        reservations = _load_reservations()
        reservations.append(record)
        _save_reservations(reservations)
        if supabase_configured():
            record = await supabase_insert_reservation(record)
        return {
            "success": False,
            "reservation": record,
            "message": availability["message"],
        }

    event_body = {
        "summary": f"Reservation — {guest_name} ({guests} guests)",
        "description": (
            f"Guest: {guest_name}\n"
            f"Phone: {phone}\n"
            f"Party size: {guests}\n"
            f"Special requests: {special_requests or 'None'}\n"
            f"Reservation ID: {reservation_id}\n"
            f"Booked via XYZ Restaurant Voice Agent"
        ),
        "start": {"dateTime": _format_google_datetime(start), "timeZone": _timezone()},
        "end": {"dateTime": _format_google_datetime(end), "timeZone": _timezone()},
        "extendedProperties": {
            "private": {
                "reservation_id": reservation_id,
                "phone": phone,
                "guests": str(guests),
            }
        },
    }

    async with _session() as session:
        token = await _get_access_token(session)
        if token:
            headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
            url = f"{CALENDAR_API}/calendars/{_calendar_id()}/events"
            async with session.post(url, json=event_body, headers=headers) as resp:
                data = await resp.json()
                if resp.status in (200, 201):
                    record["calendar_event_id"] = data.get("id")
                    record["calendar_synced"] = True
                    record["calendar_link"] = data.get("htmlLink")
                else:
                    logger.warning(
                        "Calendar event creation failed (%s): %s",
                        resp.status,
                        data.get("error", {}).get("message", data),
                    )
                    record["calendar_sync_error"] = data.get("error", {}).get("message", str(data))
        else:
            record["calendar_sync_error"] = (
                "OAuth not configured — saved locally only. "
                "Run uv run auth_google_calendar.py to enable Google Calendar sync."
            )

    reservations = _load_reservations()
    reservations.append(record)
    _save_reservations(reservations)

    if supabase_configured():
        record = await supabase_insert_reservation(record)

    if record["status"] == "confirmed":
        msg = (
            f"I've noted the reservation for {guest_name} on {date} at {time} "
            f"for {guests} guests. A manager will contact you within ten to twenty "
            f"minutes to confirm."
        )
        if record.get("calendar_synced"):
            msg += " Details saved to the restaurant calendar."
        elif record.get("supabase_synced"):
            msg += " Details saved to the booking system."
        else:
            msg += " Details saved to the restaurant booking log."
    else:
        msg = record.get("decline_reason", "Could not complete reservation.")

    return {"success": record["status"] == "confirmed", "reservation": record, "message": msg}


async def handle_function_call(
    name: str, arguments: dict, session_id: str | None = None
) -> dict:
    if name == "create_reservation":
        return await create_reservation(
            guest_name=arguments["guest_name"],
            phone=arguments["phone"],
            date=arguments["date"],
            time=arguments["time"],
            guests=int(arguments["guests"]),
            special_requests=arguments.get("special_requests", ""),
            session_id=session_id,
        )
    if name == "check_availability":
        return await check_availability(
            date=arguments["date"],
            time=arguments["time"],
            guests=int(arguments.get("guests", 2)),
        )
    if name == "end_call":
        return {
            "success": True,
            "message": "Call will end after your closing line finishes playing.",
        }
    return {"success": False, "message": f"Unknown function: {name}"}
