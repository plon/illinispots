import json
from collections.abc import Iterable
from pathlib import Path


def iter_json_chunks(rows: Iterable[dict], max_bytes: int):
    """Yield JSON rows in chunks whose encoded arrays fit within max_bytes."""
    chunk = []
    chunk_bytes = 2
    for row in rows:
        row_bytes = len(
            json.dumps(row, separators=(",", ":")).encode("utf-8")
        )
        separator_bytes = 1 if chunk else 0
        if chunk and chunk_bytes + separator_bytes + row_bytes > max_bytes:
            yield chunk
            chunk = []
            chunk_bytes = 2
            separator_bytes = 0
        if row_bytes + 2 > max_bytes:
            raise ValueError("One JSON row exceeds the chunk limit")
        chunk.append(row)
        chunk_bytes += separator_bytes + row_bytes
    if chunk:
        yield chunk


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
