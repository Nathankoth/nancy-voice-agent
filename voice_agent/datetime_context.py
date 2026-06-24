"""Live date/time context for Nancy — injected into the agent prompt each session."""

from __future__ import annotations

import os
from datetime import datetime
from zoneinfo import ZoneInfo


def restaurant_timezone() -> str:
    return (
        os.getenv("RESTAURANT_TIMEZONE")
        or os.getenv("GOOGLE_CALENDAR_TIMEZONE")
        or "Africa/Lagos"
    )


def now_in_restaurant_tz() -> datetime:
    return datetime.now(ZoneInfo(restaurant_timezone()))


def current_datetime_prompt_block() -> str:
    """Human + machine-readable context so Nancy books with real dates, not training defaults."""
    now = now_in_restaurant_tz()
    tz = restaurant_timezone()
    date_iso = now.strftime("%Y-%m-%d")
    time_24 = now.strftime("%H:%M")
    weekday = now.strftime("%A")
    month_year = now.strftime("%B %Y")

    return (
        f"\n\nCURRENT DATE AND TIME (authoritative, always use this, not training data):\n"
        f"- Restaurant timezone: {tz}\n"
        f"- Now: {weekday}, {now.strftime('%d %B %Y')}, {now.strftime('%I:%M %p').lstrip('0')} ({tz})\n"
        f"- Today (YYYY-MM-DD): {date_iso}\n"
        f"- Current time (24-hour HH:MM): {time_24}\n"
        f"- Calendar month: {month_year}\n"
        f"When the caller says tonight, today, or this evening, use {date_iso}. "
        f"Tomorrow is the next calendar day after {date_iso}. "
        f"Convert all relative dates to YYYY-MM-DD before calling check_availability or create_reservation. "
        f"Do not use dates from 2024 or 2025 unless the caller explicitly asks for a past year."
    )


def apply_datetime_context(settings: dict) -> dict:
    """Return a copy of agent settings with live date/time appended to the system prompt."""
    import copy

    out = copy.deepcopy(settings)
    block = current_datetime_prompt_block()
    agent = out.get("agent") or {}
    think = agent.get("think") or {}
    prompt = think.get("prompt", "")
    if block not in prompt:
        think["prompt"] = prompt.rstrip() + block
    agent["think"] = think
    out["agent"] = agent
    return out
