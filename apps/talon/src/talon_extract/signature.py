"""Email signature extraction using Talon's bruteforce heuristics.

Ported from mailgun/talon bruteforce.py — pure regex, no ML dependencies.
"""

from __future__ import annotations

import regex as re

SIGNATURE_MAX_LINES = 11
TOO_LONG_SIGNATURE_LINE = 60
RE_DELIMITER = re.compile(r"\r?\n")

# Common signature opener patterns
RE_SIGNATURE = re.compile(
    r"""
    (
        (?:
            ^[\s]*--*[\s]*[a-z .]*$
            |
            ^thanks[\s,!]*$
            |
            ^regards[\s,!]*$
            |
            ^cheers[\s,!]*$
            |
            ^best[ a-z]*[\s,!]*$
            |
            ^sincerely[\s,!]*$
            |
            ^warm(?:est)?[ a-z]*[\s,!]*$
            |
            ^v/r[\s,!]*$
            |
            ^respectfully[\s,!]*$
        )
        .*
    )
    """,
    re.I | re.X | re.M | re.S,
)

# Mobile device signatures
RE_PHONE_SIGNATURE = re.compile(
    r"""
    (
        (?:
            ^sent[ ]{1}from[ ]{1}my[\s,!\w]*$
            |
            ^sent[ ]from[ ]Mailbox[ ]for[ ]iPhone.*$
            |
            ^sent[ ]([\S]*[ ])?from[ ]my[ ]BlackBerry.*$
            |
            ^Enviado[ ]desde[ ]mi[ ]([\S]+[ ]){0,2}BlackBerry.*$
            |
            ^Get[ ]Outlook[ ]for[ ].*$
        )
        .*
    )
    """,
    re.I | re.X | re.M | re.S,
)

# Candidate line markers
RE_SIGNATURE_CANDIDATE = re.compile(
    r"""
    (?P<candidate>c+d)[^d]
    |
    (?P<candidate>c+d)$
    |
    (?P<candidate>c+)
    |
    (?P<candidate>d)[^d]
    |
    (?P<candidate>d)$
""",
    re.I | re.X | re.M | re.S,
)


def _get_delimiter(msg_body: str) -> str:
    match = RE_DELIMITER.search(msg_body)
    return match.group() if match else "\n"


def _mark_candidate_indexes(lines: list[str], candidate: list[int]) -> str:
    markers = list("c" * len(candidate))
    for i, line_idx in reversed(list(enumerate(candidate))):
        if len(lines[line_idx].strip()) > TOO_LONG_SIGNATURE_LINE:
            markers[i] = "l"
        else:
            line = lines[line_idx].strip()
            if line.startswith("-") and line.strip("-"):
                markers[i] = "d"
    return "".join(markers)


def _process_marked_candidate_indexes(
    candidate: list[int], markers: str
) -> list[int]:
    match = RE_SIGNATURE_CANDIDATE.match(markers[::-1])
    return candidate[-match.end("candidate") :] if match else []


def get_signature_candidate(lines: list[str]) -> list[str]:
    """Return lines that could hold signature."""
    non_empty = [i for i, line in enumerate(lines) if line.strip()]
    if len(non_empty) <= 1:
        return []

    candidate = non_empty[1:]
    candidate = candidate[-SIGNATURE_MAX_LINES:]

    markers = _mark_candidate_indexes(lines, candidate)
    candidate = _process_marked_candidate_indexes(candidate, markers)

    if candidate:
        return lines[candidate[0] :]
    return []


def extract_signature(msg_body: str) -> tuple[str, str | None]:
    """Extract signature from email body text.

    Returns (body_without_signature, signature_text).
    """
    try:
        delimiter = _get_delimiter(msg_body)
        stripped_body = msg_body.strip()
        phone_signature = None

        phone_match = RE_PHONE_SIGNATURE.search(msg_body)
        if phone_match:
            stripped_body = stripped_body[: phone_match.start()]
            phone_signature = phone_match.group()

        lines = stripped_body.splitlines()
        candidate = get_signature_candidate(lines)
        candidate_text = delimiter.join(candidate)

        signature_match = RE_SIGNATURE.search(candidate_text)
        if not signature_match:
            return (stripped_body.strip(), phone_signature)

        signature = signature_match.group()
        stripped_body = delimiter.join(lines)
        stripped_body = stripped_body[: -len(signature)]

        if phone_signature:
            signature = delimiter.join([signature, phone_signature])

        return (stripped_body.strip(), signature.strip())
    except Exception:
        return (msg_body, None)
