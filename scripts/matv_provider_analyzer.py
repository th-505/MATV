#!/usr/bin/env python3
"""Staging-only provider diagnostics. Never executes or deploys generated code."""
import argparse
import ipaddress
import json
import os
import socket
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import requests

def public_host(url):
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        return False
    try:
        addresses = socket.getaddrinfo(parsed.hostname, 443, type=socket.SOCK_STREAM)
        return bool(addresses) and all(ipaddress.ip_address(a[4][0]).is_global for a in addresses)
    except (OSError, ValueError):
        return False

def inspect(session, provider):
    url = provider["url"]
    record = {"id": provider["id"], "seed_url": url, "status": "unavailable"}
    if not public_host(url):
        record["error"] = "unsafe_or_unresolvable_host"
        return record
    try:
        current = url
        for _ in range(5):
            response = session.get(current, timeout=(5, 12), allow_redirects=False,
                                   headers={"User-Agent": "MATV-provider-diagnostics/1.0"},
                                   stream=True)
            record["http_status"] = response.status_code
            if response.status_code in (301, 302, 303, 307, 308):
                from urllib.parse import urljoin
                target = urljoin(current, response.headers.get("Location", ""))
                response.close()
                if not public_host(target):
                    record["error"] = "redirect_target_not_public_https"
                    return record
                current = target
                continue
            record["resolved_url"] = current
            record["status"] = "reachable" if response.ok else "http_error"
            response.close()
            return record
        record["error"] = "too_many_redirects"
    except requests.RequestException as exc:
        record["error"] = type(exc).__name__
    return record

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--registry", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--fail-on-expired-key", action="store_true",
                        help="Compatibility flag; key expiry is not inferred from network failures")
    args = parser.parse_args()
    providers = json.loads(Path(args.registry).read_text(encoding="utf-8"))["providers"]
    if len(providers) != 18 or len({p["id"] for p in providers}) != 18:
        parser.error("Expected exactly 18 unique providers")
    output = Path(args.out_dir)
    output.mkdir(parents=True, exist_ok=True)
    with requests.Session() as session:
        report = [inspect(session, provider) for provider in providers if provider.get("enabled")]
    destination = output / "provider-diagnostics.json"
    destination.write_text(json.dumps({"checked_at": datetime.now(timezone.utc).isoformat(),
                                        "providers": report}, ensure_ascii=False, indent=2) + "\n",
                           encoding="utf-8")
    print(f"Checked {len(report)} providers; reachable={sum(p['status']=='reachable' for p in report)}")
    print(f"Report: {destination}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
