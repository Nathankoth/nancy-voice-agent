"""Detect natural conversation endings — only after real goodbyes, not the opening greeting."""

from __future__ import annotations

import re

CLOSING_QUESTION = re.compile(
    r"would that be all|anything else i can help|is there anything else|anything more i can",
    re.IGNORECASE,
)

# After Nancy asks to close — customer confirms they're done
USER_CLOSING_CONFIRM = re.compile(
    r"\b("
    r"yes|yeah|yep|yup|sure|correct|absolutely|"
    r"that(?:'s| is) all|that(?:'s| is) it|nothing else|no thanks|"
    r"i'?m good|all set|we'?re good"
    r")\b",
    re.IGNORECASE,
)

# Customer initiates hang-up
USER_GOODBYE = re.compile(r"\b(bye|goodbye|good bye)\b", re.IGNORECASE)

# Nancy's farewell (NOT "thank you for calling" — that's in the greeting)
ASSISTANT_FAREWELL = re.compile(
    r"\b(goodbye|good bye)\b|"
    r"have a (?:great|wonderful|lovely|nice) (?:day|evening|night)|"
    r"take care",
    re.IGNORECASE,
)


def note_user_speech(activity: dict, content: str) -> None:
    text = (content or "").strip()
    if len(text) < 2:
        return
    activity["user_has_spoken"] = True
    if CLOSING_QUESTION.search(text):
        return
    if activity.get("asked_would_that_be_all") and (
        USER_CLOSING_CONFIRM.search(text) or USER_GOODBYE.search(text)
    ):
        activity["customer_confirmed_done"] = True
    if USER_GOODBYE.search(text):
        activity["user_said_goodbye"] = True


def note_assistant_speech(activity: dict, content: str) -> None:
    activity["assistant_turn_count"] = activity.get("assistant_turn_count", 0) + 1
    if CLOSING_QUESTION.search(content or ""):
        activity["asked_would_that_be_all"] = True


def should_schedule_call_end(activity: dict, content: str) -> bool:
    """Return True only when Nancy has spoken a farewell and audio should play out."""
    if not activity.get("user_has_spoken"):
        return False

    text = content or ""
    has_farewell = bool(ASSISTANT_FAREWELL.search(text))

    if activity.get("customer_confirmed_done") and has_farewell:
        return True

    if activity.get("user_said_goodbye") and has_farewell:
        return True

    return False
