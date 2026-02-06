"""Parse structured contact fields from signature blocks using local LLM."""

from __future__ import annotations

import json
import logging

import httpx

log = logging.getLogger(__name__)

OLLAMA_BASE = "https://ollama.peacockery.studio/v1"
DEFAULT_MODEL = "ministral-3:8b"

SYSTEM_PROMPT = """You extract structured contact information from email signatures.
Given a signature block and the sender's identity, return ONLY a JSON object with these fields (use null if not found):

{
  "name": "Full Name",
  "title": "Job Title",
  "company": "Company Name",
  "phone": "Phone number (digits only, no formatting)",
  "email": "email@domain.com",
  "address": "Full address if present"
}

Rules:
- Extract info for the SENDER only, not other people in the email thread
- "title" is the person's job title (e.g. "Project Manager", "VP of Operations"), NOT the company name
- Strip phone formatting: (480) 555-1234 becomes 4805551234
- If multiple phones, prefer mobile/cell over office/fax
- Return ONLY the JSON object, no other text"""


def _build_user_prompt(signature_text: str, sender_name: str = "", sender_email: str = "") -> str:
    parts = []
    if sender_name or sender_email:
        parts.append(f"Sender: {sender_name} <{sender_email}>")
    parts.append(f"Signature block:\n{signature_text}")
    return "\n\n".join(parts)


async def parse_signature(
    signature_text: str,
    *,
    sender_name: str = "",
    sender_email: str = "",
    model: str = DEFAULT_MODEL,
    base_url: str = OLLAMA_BASE,
) -> dict | None:
    """Send signature block to local LLM and parse structured fields."""
    user_prompt = _build_user_prompt(signature_text, sender_name, sender_email)
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.post(
                f"{base_url}/chat/completions",
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": user_prompt},
                    ],
                    "temperature": 0.0,
                },
            )
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"]
            return _extract_json(content)
        except Exception:
            log.exception("LLM parse failed for signature: %s", signature_text[:80])
            return None


def parse_signature_sync(
    signature_text: str,
    *,
    sender_name: str = "",
    sender_email: str = "",
    model: str = DEFAULT_MODEL,
    base_url: str = OLLAMA_BASE,
) -> dict | None:
    """Synchronous version of parse_signature."""
    user_prompt = _build_user_prompt(signature_text, sender_name, sender_email)
    with httpx.Client(timeout=30.0) as client:
        try:
            resp = client.post(
                f"{base_url}/chat/completions",
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": user_prompt},
                    ],
                    "temperature": 0.0,
                },
            )
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"]
            return _extract_json(content)
        except Exception:
            log.exception("LLM parse failed for signature: %s", signature_text[:80])
            return None


def _extract_json(text: str) -> dict | None:
    """Extract JSON object from LLM response, handling markdown fences."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        # Remove first and last fence lines
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Try to find JSON object in the text
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                return json.loads(text[start:end])
            except json.JSONDecodeError:
                return None
        return None
