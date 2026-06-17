"""Restaurant timezone helpers (default: Nigeria / West Africa Time)."""

from __future__ import annotations

import os
from datetime import datetime
from zoneinfo import ZoneInfo

DEFAULT_TIMEZONE = "Africa/Lagos"


def restaurant_timezone() -> str:
    return os.getenv("APP_TIMEZONE", os.getenv("GOOGLE_CALENDAR_TIMEZONE", DEFAULT_TIMEZONE))


def now_local() -> datetime:
    return datetime.now(ZoneInfo(restaurant_timezone()))


def now_iso() -> str:
    return now_local().isoformat()


def format_context_datetime() -> str:
    now = now_local()
    return now.strftime("%A, %d %B %Y at %H:%M %Z")
