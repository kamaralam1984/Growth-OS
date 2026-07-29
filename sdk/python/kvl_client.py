"""
KVL GrowthOS -- Python API client.

This is a real, hand-written client covering the platform's actual public
API surface: exactly 4 endpoints (workflow triggering + CSV/CRM/Excel/PDF
export of companies, deals, and contacts). It is NOT yet published to PyPI --
copy this file directly into your project to use it today.

Auth: pass the raw API key you generated at
/dashboard/settings/api-manager. Every request sends it as
`Authorization: Bearer <api_key>`.

Uses only the Python standard library (`urllib.request`) -- no third-party
dependencies required. (If you'd rather use `requests`, it's a drop-in swap,
but it is intentionally NOT required here.)
"""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Optional

DEFAULT_BASE_URL = "https://growthos.kvlbusinesssolutions.com"

ExportFormat = str  # one of: "csv", "crm", "excel", "pdf"


class KVLApiError(Exception):
    """
    Raised for any non-2xx response. `status_code` is the HTTP status code
    and `message` is the real `{"error": "..."}` message returned by the API
    (e.g. "Invalid or missing API key.", "This API key does not have the
    'export:companies:read' scope.", "Rate limit exceeded.").
    """

    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message

    def __str__(self) -> str:
        return f"KVLApiError({self.status_code}): {self.message}"


class KVLClient:
    def __init__(self, api_key: str, base_url: str = DEFAULT_BASE_URL) -> None:
        if not api_key:
            raise ValueError("KVLClient requires an `api_key`.")
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")

    def trigger_workflow(self, workflow_id: str) -> dict:
        """
        POST /api/v1/workflows/{workflowId}/trigger

        Requires the `workflows:trigger` scope. Triggers a workflow run and
        returns the new run's id as {"runId": str}. The workflow must be
        ACTIVE and belong to your organization.
        """
        path = f"/api/v1/workflows/{urllib.parse.quote(workflow_id, safe='')}/trigger"
        response_bytes, _headers = self._request(path, method="POST")
        return json.loads(response_bytes.decode("utf-8"))

    def export_companies(self, format: ExportFormat = "csv") -> bytes:
        """
        GET /api/export/companies?format=csv|crm|excel|pdf

        Requires the `export:companies:read` scope. Returns the raw response
        body as bytes (decode/parse it yourself depending on `format`).
        """
        return self._export("/api/export/companies", format)

    def export_deals(self, format: ExportFormat = "csv") -> bytes:
        """
        GET /api/export/deals?format=csv|crm|excel|pdf

        Requires the `export:deals:read` scope.
        """
        return self._export("/api/export/deals", format)

    def export_contacts(self, format: ExportFormat = "csv") -> bytes:
        """
        GET /api/export/contacts?format=csv|crm|excel|pdf

        Requires the `export:contacts:read` scope.
        """
        return self._export("/api/export/contacts", format)

    def _export(self, path: str, format: ExportFormat) -> bytes:
        query = urllib.parse.urlencode({"format": format})
        response_bytes, _headers = self._request(f"{path}?{query}", method="GET")
        return response_bytes

    def _request(self, path: str, method: str) -> "tuple[bytes, dict]":
        url = f"{self.base_url}{path}"
        request = urllib.request.Request(
            url,
            method=method,
            headers={"Authorization": f"Bearer {self.api_key}"},
        )
        try:
            with urllib.request.urlopen(request) as response:
                return response.read(), dict(response.headers)
        except urllib.error.HTTPError as http_error:
            body = http_error.read()
            message = f"Request failed with status {http_error.code}."
            try:
                parsed = json.loads(body.decode("utf-8"))
                if isinstance(parsed, dict) and parsed.get("error"):
                    message = parsed["error"]
            except (json.JSONDecodeError, UnicodeDecodeError):
                pass
            raise KVLApiError(http_error.code, message) from http_error
