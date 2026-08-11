"""Send Sentry Cron Monitor check-ins from GitHub Actions.

This helper deliberately treats Sentry as best-effort: an observability outage
must not stop the data pipeline itself.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

import sentry_sdk
from sentry_sdk.crons import MonitorStatus, capture_checkin


def initialize_sentry() -> bool:
    dsn = os.getenv("SENTRY_DSN")
    if not dsn:
        print("SENTRY_DSN is not configured; skipping Sentry monitor check-in")
        return False

    sentry_sdk.init(
        dsn=dsn,
        environment=os.getenv("SENTRY_ENVIRONMENT", "production"),
        release=os.getenv("GITHUB_SHA"),
        send_default_pii=False,
    )
    return True


def write_github_output(name: str, value: str) -> None:
    output_path = os.getenv("GITHUB_OUTPUT")
    if output_path:
        with Path(output_path).open("a", encoding="utf-8") as output_file:
            output_file.write(f"{name}={value}\n")


def start_monitor(args: argparse.Namespace) -> None:
    check_in_id = ""
    if initialize_sentry():
        try:
            check_in_id = capture_checkin(
                monitor_slug=args.monitor_slug,
                status=MonitorStatus.IN_PROGRESS,
                monitor_config={
                    "schedule": {"type": "crontab", "value": args.schedule},
                    "timezone": "UTC",
                    "checkin_margin": args.checkin_margin,
                    "max_runtime": args.max_runtime,
                },
            )
            sentry_sdk.flush(timeout=2)
            print(
                f"Started Sentry monitor {args.monitor_slug} "
                f"with check-in {check_in_id}"
            )
        except Exception as error:
            print(f"Unable to start Sentry monitor: {error}")

    write_github_output("check_in_id", check_in_id)


def finish_monitor(args: argparse.Namespace) -> None:
    if not args.check_in_id:
        print("No Sentry check-in ID was created; skipping completion check-in")
        return
    if not initialize_sentry():
        return

    try:
        status = MonitorStatus.OK if args.status == "ok" else MonitorStatus.ERROR
        capture_checkin(
            monitor_slug=args.monitor_slug,
            check_in_id=args.check_in_id,
            status=status,
        )
        sentry_sdk.flush(timeout=2)
        print(f"Completed Sentry monitor {args.monitor_slug} with status {args.status}")
    except Exception as error:
        print(f"Unable to complete Sentry monitor: {error}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)

    start_parser = subparsers.add_parser("start")
    start_parser.add_argument("--monitor-slug", required=True)
    start_parser.add_argument("--schedule", required=True)
    start_parser.add_argument("--checkin-margin", type=int, required=True)
    start_parser.add_argument("--max-runtime", type=int, required=True)
    start_parser.set_defaults(handler=start_monitor)

    finish_parser = subparsers.add_parser("finish")
    finish_parser.add_argument("--monitor-slug", required=True)
    finish_parser.add_argument("--check-in-id", required=True)
    finish_parser.add_argument("--status", choices=("ok", "error"), required=True)
    finish_parser.set_defaults(handler=finish_monitor)

    return parser.parse_args()


def main() -> None:
    args = parse_args()
    args.handler(args)


if __name__ == "__main__":
    main()
