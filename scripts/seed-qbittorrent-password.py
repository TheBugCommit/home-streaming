#!/usr/bin/env python3
"""One-time (but safe to re-run) host setup step.

The qBittorrent image (lscr.io/linuxserver/qbittorrent) has no environment variable to set the
WebUI password — it only generates a random temporary one on first boot ("temporary password
provided for this session", printed to container logs) and expects you to change it by hand via
the WebUI. That breaks torrent-worker's automated bootstrap, which needs to log in with
QBITTORRENT_USERNAME/QBITTORRENT_PASSWORD from .env non-interactively.

qBittorrent stores its permanent WebUI credentials in qBittorrent.conf as a PBKDF2-SHA512 hash
(100000 iterations, 64-byte digest, 16-byte random salt), in the format:
    WebUI\\Password_PBKDF2="@ByteArray(<base64 salt>:<base64 hash>)"

This script writes that key (and WebUI\\Username) directly into the bind-mounted config file, so
qBittorrent picks up the configured credentials on its next start — no manual WebUI step needed.

Usage: python3 scripts/seed-qbittorrent-password.py
Reads QBITTORRENT_USERNAME / QBITTORRENT_PASSWORD from .env, then restart qbittorrent:
    docker compose restart qbittorrent
"""
import hashlib
import os
import re
import secrets
import sys
from base64 import b64encode
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
CONF_PATH = REPO_ROOT / "qbittorrent" / "config" / "qBittorrent" / "qBittorrent.conf"


def load_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        env[key.strip()] = value.strip()
    return env


def pbkdf2_field(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha512", password.encode("utf-8"), salt, 100_000, dklen=64)
    return f"@ByteArray({b64encode(salt).decode()}:{b64encode(digest).decode()})"


def main() -> int:
    env = load_env(REPO_ROOT / ".env")
    username = env.get("QBITTORRENT_USERNAME", "admin")
    password = env.get("QBITTORRENT_PASSWORD")
    if not password:
        print("QBITTORRENT_PASSWORD not set in .env", file=sys.stderr)
        return 1

    if not CONF_PATH.exists():
        print(f"{CONF_PATH} does not exist yet — start the qbittorrent container once first.", file=sys.stderr)
        return 1

    text = CONF_PATH.read_text()
    pbkdf2_line = f'WebUI\\Password_PBKDF2="{pbkdf2_field(password)}"'
    username_line = f"WebUI\\Username={username}"

    if "[Preferences]" not in text:
        text += "\n[Preferences]\n"

    def upsert_key(text: str, key_prefix: str, new_line: str) -> str:
        pattern = re.compile(rf"^{re.escape(key_prefix)}=.*$", re.MULTILINE)
        if pattern.search(text):
            return pattern.sub(lambda _m: new_line, text)
        return re.sub(r"(\[Preferences\]\n)", lambda m: m.group(1) + new_line + "\n", text, count=1)

    text = upsert_key(text, "WebUI\\Username", username_line)
    text = upsert_key(text, "WebUI\\Password_PBKDF2", pbkdf2_line)

    CONF_PATH.write_text(text)
    print(f"Seeded WebUI credentials for user '{username}' into {CONF_PATH}")
    print("Now run: docker compose restart qbittorrent")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
