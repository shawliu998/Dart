#!/usr/bin/env python3
"""Probe and seed a running local BidEvidence API without third-party packages."""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request

TENANT_ID = "00000000-0000-0000-0000-000000000001"
USER_ID = "00000000-0000-0000-0000-000000000002"


def request(url: str, *, method: str = "GET") -> dict:
    headers = {
        "X-Tenant-ID": TENANT_ID,
        "X-User-ID": USER_ID,
        "X-Role": "admin",
    }
    req = urllib.request.Request(url, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=3) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default=os.getenv("API_BASE_URL", "http://127.0.0.1:8000"))
    parser.add_argument("--probe", action="store_true")
    args = parser.parse_args()
    base_url = args.base_url.rstrip("/")
    try:
        health = request(f"{base_url}/health")
        if health.get("service") != "bidevidence-api" or health.get("status") != "ok":
            raise ValueError("port does not expose a healthy BidEvidence API")
        if args.probe:
            return
        result = request(f"{base_url}/api/dev/seed", method="POST")
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except (OSError, ValueError, urllib.error.HTTPError) as exc:
        if not args.probe:
            print(f"无法 seed 运行中的 API：{exc}", file=sys.stderr)
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
