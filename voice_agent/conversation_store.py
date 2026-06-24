"""Local + Supabase conversation log storage."""

from __future__ import annotations

import json
import logging
from pathlib import Path

from supabase_service import (
    insert_conversation_log,
    is_configured as supabase_configured,
    list_conversation_logs as list_supabase_logs,
)

logger = logging.getLogger("voice_agent.conversations")

CONVERSATIONS_PATH = Path(__file__).parent / "logs" / "conversations.jsonl"


def append_local_log(entry: dict, session_id: str | None) -> None:
    CONVERSATIONS_PATH.parent.mkdir(exist_ok=True)
    row = {
        "session_id": session_id,
        "category": entry.get("category", "system"),
        "message": entry.get("message", ""),
        "created_at": entry.get("timestamp"),
        "metadata": entry.get("extra") or {},
    }
    with open(CONVERSATIONS_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(row) + "\n")


def list_local_logs(session_id: str | None = None, limit: int = 500) -> list[dict]:
    if not CONVERSATIONS_PATH.exists():
        return []
    rows: list[dict] = []
    try:
        with open(CONVERSATIONS_PATH, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    row = json.loads(line)
                    if session_id and row.get("session_id") != session_id:
                        continue
                    rows.append(row)
                except json.JSONDecodeError:
                    continue
    except OSError as exc:
        logger.warning("Read conversations log failed: %s", exc)
    rows.sort(key=lambda r: r.get("created_at") or "", reverse=True)
    return rows[:limit]


async def persist_log(entry: dict, session_id: str | None) -> None:
    append_local_log(entry, session_id)
    if supabase_configured():
        await insert_conversation_log(
            category=entry.get("category", "system"),
            message=entry.get("message", ""),
            session_id=session_id,
            metadata=entry.get("extra"),
        )


async def list_all_logs(session_id: str | None = None, limit: int = 200) -> list[dict]:
    """Prefer Supabase when configured; always merge in local logs for dev."""
    local = list_local_logs(session_id=session_id, limit=limit)
    if supabase_configured():
        remote = await list_supabase_logs(session_id=session_id, limit=limit)
        if remote:
            seen = {(r.get("session_id"), r.get("created_at"), r.get("message")) for r in remote}
            merged = list(remote)
            for row in local:
                key = (row.get("session_id"), row.get("created_at"), row.get("message"))
                if key not in seen:
                    merged.append(row)
            merged.sort(key=lambda r: r.get("created_at") or "", reverse=True)
            return merged[:limit]
    return local
