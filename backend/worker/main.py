from __future__ import annotations

import argparse
import time

from app.services.jobs import process_next_job


def main() -> None:
    parser = argparse.ArgumentParser(description="BidEvidence durable worker entrypoint")
    parser.add_argument("--once", action="store_true", help="check queue once and exit")
    parser.add_argument("--poll-seconds", type=float, default=1.0)
    args = parser.parse_args()
    if args.once:
        processed = 0
        while process_next_job():
            processed += 1
        print(f"BidEvidence worker processed {processed} queued job(s)")
        return
    print("BidEvidence worker polling persistent async_jobs")
    while True:
        if not process_next_job():
            time.sleep(max(0.1, args.poll_seconds))


if __name__ == "__main__":
    main()
