"""Send Sentry Cron Monitor check-ins from GitHub Actions.

This helper deliberately treats Sentry as best-effort: an observability outage
must not stop the data pipeline itself.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Mapping


def initialize_sentry() -> Any | None:
    dsn = os.getenv("SENTRY_DSN")
    if not dsn:
        print("SENTRY_DSN is not configured; skipping Sentry reporting")
        return None

    try:
        import sentry_sdk

        sentry_sdk.init(
            dsn=dsn,
            environment=os.getenv("SENTRY_ENVIRONMENT", "production"),
            release=os.getenv("GITHUB_SHA"),
            send_default_pii=False,
        )
    except Exception as error:
        print(f"Unable to initialize Sentry; skipping reporting: {error}")
        return None
    return sentry_sdk


def write_github_output(name: str, value: str) -> None:
    output_path = os.getenv("GITHUB_OUTPUT")
    if output_path:
        with Path(output_path).open("a", encoding="utf-8") as output_file:
            output_file.write(f"{name}={value}\n")


def start_monitor(args: argparse.Namespace) -> None:
    check_in_id = ""
    sentry = initialize_sentry()
    if sentry:
        try:
            from sentry_sdk.crons import MonitorStatus, capture_checkin

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
            sentry.flush(timeout=2)
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
    sentry = initialize_sentry()
    if not sentry:
        return

    try:
        from sentry_sdk.crons import MonitorStatus, capture_checkin

        status = MonitorStatus.OK if args.status == "ok" else MonitorStatus.ERROR
        capture_checkin(
            monitor_slug=args.monitor_slug,
            check_in_id=args.check_in_id,
            status=status,
        )
        sentry.flush(timeout=2)
        print(f"Completed Sentry monitor {args.monitor_slug} with status {args.status}")
    except Exception as error:
        print(f"Unable to complete Sentry monitor: {error}")


def emit_gauges(
    values: Mapping[str, int | float], attributes: Mapping[str, Any]
) -> None:
    """Send pipeline data-volume gauges to Sentry without affecting the load."""
    sentry = initialize_sentry()
    if not sentry:
        return

    try:
        from sentry_sdk import metrics

        for name, value in values.items():
            metrics.gauge(name, value, attributes=dict(attributes))
        sentry.flush(timeout=5)
        print(f"Sent {len(values)} data-volume metrics to Sentry")
    except Exception as error:
        print(f"Unable to send data-volume metrics to Sentry: {error}")


def github_escape(value: str) -> str:
    return value.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")


def github_run_url() -> str:
    repository = os.getenv("GITHUB_REPOSITORY", "")
    run_id = os.getenv("GITHUB_RUN_ID", "")
    if not repository or not run_id:
        return ""
    server_url = os.getenv("GITHUB_SERVER_URL", "https://github.com")
    return f"{server_url}/{repository}/actions/runs/{run_id}"


def report_stage_failure(
    args: argparse.Namespace, exit_code: int, duration_seconds: float
) -> None:
    """Send the exact failed stage to Sentry without masking the pipeline error."""
    sentry = initialize_sentry()
    if not sentry:
        return

    try:
        with sentry.new_scope() as scope:
            scope.set_tag("pipeline", args.monitor_slug)
            scope.set_tag("pipeline.stage", args.stage)
            scope.set_tag("github.run_id", os.getenv("GITHUB_RUN_ID", ""))
            scope.set_tag("github.run_attempt", os.getenv("GITHUB_RUN_ATTEMPT", ""))
            scope.set_context(
                "pipeline_stage",
                {
                    "label": args.label,
                    "exit_code": exit_code,
                    "duration_seconds": duration_seconds,
                    "workflow": os.getenv("GITHUB_WORKFLOW", ""),
                    "ref": os.getenv("GITHUB_REF_NAME", ""),
                    "run_url": github_run_url(),
                },
            )
            sentry.capture_message(
                f"Pipeline stage failed: {args.label}", level="error"
            )
        sentry.flush(timeout=2)
    except Exception as error:
        print(f"Unable to report stage failure to Sentry: {error}")


def run_stage(args: argparse.Namespace) -> int:
    stage_command = list(args.stage_command)
    if stage_command and stage_command[0] == "--":
        stage_command.pop(0)
    if not stage_command:
        raise ValueError("A command is required after --")

    print(f"Starting pipeline stage: {args.label}", flush=True)
    started_at = time.monotonic()
    try:
        result = subprocess.run(stage_command, check=False)
        exit_code = result.returncode
    except OSError as error:
        print(f"Unable to start stage command: {error}", file=sys.stderr, flush=True)
        exit_code = 127 if isinstance(error, FileNotFoundError) else 126

    duration_seconds = round(time.monotonic() - started_at, 3)
    if exit_code == 0:
        print(
            f"Completed pipeline stage: {args.label} ({duration_seconds:.1f}s)",
            flush=True,
        )
        return 0

    message = f"{args.label} exited with code {exit_code} after {duration_seconds:.1f}s"
    print(f"::error title=Pipeline stage failed::{github_escape(message)}", flush=True)
    report_stage_failure(args, exit_code, duration_seconds)
    return exit_code


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

    stage_parser = subparsers.add_parser(
        "run-stage", help="Run a pipeline stage and report failures to Sentry"
    )
    stage_parser.add_argument("--monitor-slug", required=True)
    stage_parser.add_argument("--stage", required=True)
    stage_parser.add_argument("--label", required=True)
    stage_parser.add_argument("stage_command", nargs=argparse.REMAINDER)
    stage_parser.set_defaults(handler=run_stage)

    return parser.parse_args()


def main() -> int:
    args = parse_args()
    return args.handler(args) or 0


if __name__ == "__main__":
    raise SystemExit(main())
