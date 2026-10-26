#!/usr/bin/env python3
"""Write provenance metadata beside a T-A-TV release artifact."""
import argparse
import json
import re
from pathlib import Path
from urllib.parse import urlsplit


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", required=True)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--api", required=True)
    parser.add_argument("--sha", required=True)
    parser.add_argument("--pubspec", default="flutter_app/pubspec.yaml", type=Path)
    args = parser.parse_args()

    endpoint = urlsplit(args.api)
    if endpoint.scheme != "https" or not endpoint.hostname or endpoint.username or endpoint.password:
        raise SystemExit("API base must be an HTTPS origin")
    if endpoint.query or endpoint.fragment or endpoint.path not in ("", "/"):
        raise SystemExit("API base must not contain a path, query, or fragment")
    if not re.fullmatch(r"[0-9a-f]{40}", args.sha):
        raise SystemExit("source SHA must be a full 40-character Git commit")

    match = re.search(r"^version:\s*(\d+\.\d+\.\d+)\+(\d+)\s*$", args.pubspec.read_text(), re.M)
    if not match:
        raise SystemExit("pubspec.yaml has no valid product version")
    version, build = match.groups()
    record = {
        "schema_version": 1,
        "product": "T-A-TV",
        "version": version,
        "build": int(build),
        "target": args.target,
        "api_base": f"{endpoint.scheme}://{endpoint.netloc}",
        "source_commit": args.sha,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(record, ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
