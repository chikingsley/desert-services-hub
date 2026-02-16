"""Async Cloudflare API client."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import httpx

if TYPE_CHECKING:
    from cf_mcp.config import Settings

BASE_URL = "https://api.cloudflare.com/client/v4"


class CloudflareError(Exception):
    """Cloudflare API error with code and message."""

    def __init__(self, errors: list[dict[str, Any]], status_code: int = 0) -> None:
        self.errors = errors
        self.status_code = status_code
        messages = "; ".join(e.get("message", str(e)) for e in errors)
        super().__init__(f"Cloudflare API error: {messages}")


class CloudflareClient:
    """Async client for the Cloudflare REST API."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._http: httpx.AsyncClient | None = None

    async def __aenter__(self) -> CloudflareClient:
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.close()

    async def _client(self) -> httpx.AsyncClient:
        if self._http is None or self._http.is_closed:
            self._http = httpx.AsyncClient(
                base_url=BASE_URL,
                headers={
                    "Authorization": f"Bearer {self._settings.token}",
                    "Content-Type": "application/json",
                },
                timeout=30.0,
            )
        return self._http

    async def close(self) -> None:
        """Close the underlying HTTP client."""
        if self._http and not self._http.is_closed:
            await self._http.aclose()

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        client = await self._client()
        resp = await client.request(method, path, json=json, params=params)
        data = resp.json()

        if not data.get("success", False):
            raise CloudflareError(
                data.get("errors", [{"message": "Unknown error"}]),
                status_code=resp.status_code,
            )

        return data.get("result")

    async def get(
        self,
        path: str,
        *,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """GET request."""
        return await self._request("GET", path, params=params)

    async def post(
        self,
        path: str,
        *,
        json: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """POST request."""
        return await self._request("POST", path, json=json)

    async def put(
        self,
        path: str,
        *,
        json: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """PUT request."""
        return await self._request("PUT", path, json=json)

    async def delete(self, path: str) -> dict[str, Any]:
        """DELETE request."""
        return await self._request("DELETE", path)

    async def get_paginated(
        self,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        per_page: int = 50,
    ) -> list[Any]:
        """GET with automatic pagination. Returns all results."""
        all_results: list[Any] = []
        page = 1
        p = dict(params or {})
        p["per_page"] = per_page

        while True:
            p["page"] = page
            client = await self._client()
            resp = await client.get(path, params=p)
            data = resp.json()

            if not data.get("success", False):
                raise CloudflareError(
                    data.get("errors", [{"message": "Unknown error"}]),
                    status_code=resp.status_code,
                )

            result = data.get("result", [])
            if not result:
                break

            all_results.extend(result)

            result_info = data.get("result_info", {})
            total_pages = result_info.get("total_pages", 1)
            if page >= total_pages:
                break
            page += 1

        return all_results

    # ── Convenience: account ID resolution ──

    _account_id_cache: str | None = None

    async def resolve_account_id(self) -> str:
        """Resolve the account ID: use settings if set, otherwise auto-detect via API.

        If the account has exactly one account, it is returned automatically.
        If multiple accounts exist, raises ValueError asking the user to set the env var.
        """
        # Use configured value if available
        acct = self._settings.account_id
        if acct:
            return acct

        # Auto-detect from cached value
        if self._account_id_cache is not None:
            return self._account_id_cache

        # Fetch from API
        accounts = await self.get_paginated("/accounts")
        if not accounts:
            msg = (
                "No accounts found for this API token. "
                "Verify your token has account-level permissions."
            )
            raise ValueError(msg)

        if len(accounts) == 1:
            self._account_id_cache = accounts[0]["id"]
            return self._account_id_cache

        names = ", ".join(f"{a['name']} ({a['id']})" for a in accounts)
        msg = f"Multiple accounts found: {names}. Set CLOUDFLARE_ACCOUNT_ID to select one."
        raise ValueError(msg)

    # ── Convenience: zone name → ID resolution ──

    _zone_cache: dict[str, str] | None = None

    async def resolve_zone_id(self, zone_name: str) -> str:
        """Resolve a zone name to its ID, with caching."""
        if self._zone_cache is None:
            zones = await self.get_paginated("/zones")
            self._zone_cache = {z["name"]: z["id"] for z in zones}

        zone_id = self._zone_cache.get(zone_name)
        if not zone_id:
            available = ", ".join(sorted(self._zone_cache.keys()))
            msg = f"Zone '{zone_name}' not found. Available: {available}"
            raise ValueError(msg)
        return zone_id
