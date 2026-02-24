from __future__ import annotations

import argparse
from pathlib import Path


def generate(path: Path, lines: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for i in range(1, lines + 1):
            handle.write(f"{i:06d}: Example line for TxtReader performance testing.\n")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate a sample .txt file with many lines.")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("sample_100k.txt"),
        help="Output file path.",
    )
    parser.add_argument(
        "--lines",
        type=int,
        default=100_000,
        help="Number of lines to generate.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    generate(path=args.output, lines=args.lines)
    print(f"Generated {args.lines:,} lines at {args.output}")


if __name__ == "__main__":
    main()

