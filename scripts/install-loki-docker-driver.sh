#!/usr/bin/env bash
# One-time host prerequisite for centralized logging (see shared/events/README.md and the
# "Logging centralitzat" section of the implementation plan).
#
# docker-compose.yml configures every service with `logging: driver: loki`, which requires this
# Docker plugin to be installed on the host BEFORE running `docker compose up` — otherwise every
# container (including the previously-working jellyfin/tdarr) will fail to start.
set -euo pipefail

if docker plugin ls --format '{{.Name}}' | grep -q '^loki:'; then
  echo "Loki Docker logging driver already installed."
  exit 0
fi

docker plugin install grafana/loki-docker-driver:latest --alias loki --grant-all-permissions
echo "Loki Docker logging driver installed. You can now run: docker compose up -d"
