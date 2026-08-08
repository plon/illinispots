from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List


DATA_DIR = Path(__file__).parent / "data"
ENRICHED_FILE = DATA_DIR / "buildings_enriched.json"
CANONICAL_FILE = DATA_DIR / "buildings.json"

REQUIRED_BUILDING_KEYS = {"hours", "coordinates", "rooms"}
REQUIRED_HOURS_KEYS = {
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
}
REQUIRED_COORDINATE_KEYS = {"latitude", "longitude"}


def audit_buildings(buildings: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Return metadata issues grouped by building name."""
    issues = []

    for building_name, building_data in buildings.items():
        issue: Dict[str, Any] = {"building": building_name}

        missing_keys = sorted(REQUIRED_BUILDING_KEYS - set(building_data))
        if missing_keys:
            issue["missing_keys"] = missing_keys

        hours = building_data.get("hours")
        if "hours" not in missing_keys:
            if not isinstance(hours, dict):
                issue["invalid_hours"] = True
            else:
                missing_days = sorted(REQUIRED_HOURS_KEYS - set(hours))
                if missing_days:
                    issue["missing_hours_days"] = missing_days

        coordinates = building_data.get("coordinates")
        if "coordinates" not in missing_keys:
            if not isinstance(coordinates, dict):
                issue["invalid_coordinates"] = True
            else:
                missing_coordinate_keys = sorted(
                    REQUIRED_COORDINATE_KEYS - set(coordinates)
                )
                if missing_coordinate_keys:
                    issue["missing_coordinate_keys"] = missing_coordinate_keys

        if len(issue) > 1:
            issues.append(issue)

    return issues


def remove_incomplete_buildings(
    building_data: Dict[str, Any], issues: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """Return a copy of the dataset without buildings that cannot be loaded."""
    incomplete_names = {issue["building"] for issue in issues}
    filtered_data = dict(building_data)
    filtered_data["buildings"] = {
        name: data
        for name, data in building_data["buildings"].items()
        if name not in incomplete_names
    }
    return filtered_data


def describe_issue(issue: Dict[str, Any]) -> str:
    details = []
    if issue.get("missing_keys"):
        details.append(f"missing keys: {', '.join(issue['missing_keys'])}")
    if issue.get("missing_hours_days"):
        details.append(
            f"missing hours for: {', '.join(issue['missing_hours_days'])}"
        )
    if issue.get("missing_coordinate_keys"):
        details.append(
            f"missing coordinates for: {', '.join(issue['missing_coordinate_keys'])}"
        )
    if issue.get("invalid_hours"):
        details.append("hours is not an object")
    if issue.get("invalid_coordinates"):
        details.append("coordinates is not an object")
    return "; ".join(details)


def write_github_summary(issues: List[Dict[str, Any]]) -> None:
    summary_path = os.getenv("GITHUB_STEP_SUMMARY")
    if not summary_path:
        return

    with open(summary_path, "a") as summary:
        summary.write("\n## Building metadata audit\n\n")
        if not issues:
            summary.write("✅ All loaded buildings have hours and coordinates.\n")
            return

        summary.write(
            f"⚠️ {len(issues)} building(s) were excluded from the database load "
            "because metadata is incomplete.\n\n"
        )
        summary.write("| Building | Issue |\n| --- | --- |\n")
        for issue in issues:
            building_name = issue["building"].replace("|", "\\|")
            summary.write(f"| `{building_name}` | {describe_issue(issue)} |\n")


def emit_github_warnings(issues: List[Dict[str, Any]]) -> None:
    for issue in issues:
        message = f"{issue['building']} excluded: {describe_issue(issue)}"
        escaped_message = (
            message.replace("%", "%25")
            .replace("\r", "%0D")
            .replace("\n", "%0A")
        )
        print(f"::warning title=Building metadata::{escaped_message}")


def main() -> None:
    with open(ENRICHED_FILE, "r") as enriched_file:
        building_data = json.load(enriched_file)

    issues = audit_buildings(building_data["buildings"])

    if issues:
        filtered_data = remove_incomplete_buildings(building_data, issues)
        for output_file in (ENRICHED_FILE, CANONICAL_FILE):
            with open(output_file, "w") as output:
                json.dump(filtered_data, output, indent=2)

        print(
            f"\nWarning: excluded {len(issues)} building(s) with incomplete metadata."
        )
        for issue in issues:
            print(f"- {issue['building']}: {describe_issue(issue)}")
    else:
        print("\nBuilding metadata audit passed: all buildings are loadable.")

    emit_github_warnings(issues)
    write_github_summary(issues)


if __name__ == "__main__":
    main()
