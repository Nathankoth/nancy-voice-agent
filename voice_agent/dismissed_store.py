"""Track admin-dismissed inquiry sessions (local file)."""

from __future__ import annotations

import json
from pathlib import Path

DISMISSED_PATH = Path(__file__).parent / "logs" / "dismissed_sessions.json"
DISMISSED_PATH.parent.mkdir(exist_ok=True)


def _load() -> set[str]:
    if not DISMISSED_PATH.exists():
        return set()
    try:
        with open(DISMISSED_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return {str(x) for x in data}
    except (OSError, json.JSONDecodeError):
        pass
    return set()


def _save(ids: set[str]) -> None:
    with open(DISMISSED_PATH, "w", encoding="utf-8") as f:
        json.dump(sorted(ids), f, indent=2)
        f.write("\n")


def list_dismissed() -> list[str]:
    return sorted(_load())


def dismiss_session(session_id: str) -> bool:
    if not session_id:
        return False
    ids = _load()
    if session_id in ids:
        return True
    ids.add(session_id)
    _save(ids)
    return True


def is_dismissed(session_id: str) -> bool:
    return session_id in _load()
