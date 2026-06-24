"""Generate and cache call summaries for the admin dashboard."""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

import aiohttp

from conversation_store import list_all_logs

logger = logging.getLogger("voice_agent.summarize")

SUMMARIES_PATH = Path(__file__).parent / "logs" / "call_summaries.json"


def _load_cache() -> dict:
    if not SUMMARIES_PATH.exists():
        return {}
    try:
        with open(SUMMARIES_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}


def _save_cache(data: dict) -> None:
    SUMMARIES_PATH.parent.mkdir(exist_ok=True)
    with open(SUMMARIES_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")


def _format_transcript(logs: list[dict]) -> str:
    lines = []
    for row in sorted(logs, key=lambda r: r.get("created_at") or ""):
        cat = row.get("category", "")
        if cat not in ("stt", "llm"):
            continue
        speaker = "Caller" if cat == "stt" else "Nancy"
        lines.append(f"{speaker}: {row.get('message', '')}")
    return "\n".join(lines)


def _rule_based_summary(transcript: str, reservation: dict | None = None) -> str:
    if reservation:
        name = reservation.get("guest_name", "Guest")
        guests = reservation.get("guests") or reservation.get("party_size", "")
        date = reservation.get("date", "")
        time = reservation.get("time", "")
        notes = reservation.get("special_requests") or ""
        parts = [
            f"{name} called to book a table for {guests} guests on {date} at {time}.",
            "Nancy collected their contact details and explained that a manager will confirm within ten to twenty minutes.",
        ]
        if notes:
            parts.append(f"Special request: {notes}.")
        if transcript:
            parts.append("The caller and Nancy discussed the booking briefly to confirm the details.")
        return " ".join(parts)

    if not transcript.strip():
        return "Brief call with Nancy. No detailed transcript was captured."

    caller_lines = [l for l in transcript.split("\n") if l.startswith("Caller:")]
    topic = caller_lines[0].replace("Caller:", "").strip() if caller_lines else "a general inquiry"
    return (
        f"The caller contacted Nancy regarding {topic[:120]}. "
        "Nancy assisted with the request and noted that a manager will follow up within ten to twenty minutes if needed."
    )


async def _openai_summary(transcript: str) -> str | None:
    api_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if not api_key or not transcript.strip():
        return None

    payload = {
        "model": os.getenv("OPENAI_SUMMARY_MODEL", "gpt-4o-mini"),
        "messages": [
            {
                "role": "system",
                "content": (
                    "Summarize this restaurant voice call in 2-3 clear sentences for staff. "
                    "Include guest intent, key details captured, and outcome. No bullet points."
                ),
            },
            {"role": "user", "content": transcript},
        ],
        "max_tokens": 200,
        "temperature": 0.3,
    }

    try:
        async with aiohttp.ClientSession(trust_env=False) as session:
            async with session.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            ) as resp:
                if resp.status != 200:
                    body = await resp.text()
                    logger.warning("OpenAI summary failed (%s): %s", resp.status, body[:200])
                    return None
                data = await resp.json()
                return data["choices"][0]["message"]["content"].strip()
    except Exception as exc:
        logger.warning("OpenAI summary error: %s", exc)
        return None


async def summarize_session(
    session_id: str,
    reservation: dict | None = None,
) -> dict:
    cache = _load_cache()
    if session_id in cache:
        return cache[session_id]

    logs = await list_all_logs(session_id=session_id, limit=200)
    transcript = _format_transcript(logs)

    ai_summary = await _openai_summary(transcript)
    summary = ai_summary or _rule_based_summary(transcript, reservation)

    entry = {
        "session_id": session_id,
        "summary": summary,
        "transcript_lines": len([l for l in logs if l.get("category") in ("stt", "llm")]),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "openai" if ai_summary else "rule-based",
    }
    cache[session_id] = entry
    _save_cache(cache)
    return entry


async def get_session_summary(session_id: str, reservation: dict | None = None) -> dict:
    cache = _load_cache()
    if session_id in cache:
        return cache[session_id]
    return await summarize_session(session_id, reservation)
