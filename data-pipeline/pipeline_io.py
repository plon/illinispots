import json
from collections.abc import Iterable
from pathlib import Path


def write_json_snapshot(output_file: Path, data: object) -> None:
    """Compactly encode and atomically replace one machine-owned snapshot."""
    write_json_snapshots((output_file,), data)


def write_json_snapshots(output_files: Iterable[Path], data: object) -> None:
    """Encode once when the same snapshot is published to multiple paths."""
    encoded = json.dumps(data, separators=(",", ":"))
    for output_file in output_files:
        temporary_file = output_file.with_suffix(f"{output_file.suffix}.tmp")
        with open(temporary_file, "w", encoding="utf-8") as file:
            file.write(encoded)
        temporary_file.replace(output_file)
