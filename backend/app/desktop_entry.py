"""Loopback-only FastAPI entry point for the Electron runtime supervisor."""

from __future__ import annotations

import argparse
import os

import uvicorn


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the BidEvidence desktop API sidecar")
    parser.add_argument("--port", type=int)
    args = parser.parse_args()
    configured_port = args.port or int(os.getenv("BIDEVIDENCE_RUNTIME_PORT", "0"))
    if not 1 <= configured_port <= 65535:
        raise SystemExit("port must be between 1 and 65535")
    uvicorn.run("app.main:app", host="127.0.0.1", port=configured_port, log_level="warning")


if __name__ == "__main__":
    main()
