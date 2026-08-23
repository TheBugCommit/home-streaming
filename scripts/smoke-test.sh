#!/usr/bin/env bash
# Smoke test per capes. Cada etapa es pot executar sola, de manera que quan
# alguna cosa falla saps exactament quin tram del pipeline l'ha trencada.
#
#   ./scripts/smoke-test.sh preflight    # env vars i prerequisits, sense aixecar res
#   ./scripts/smoke-test.sh infra        # postgres / nats / core-api responen
#   ./scripts/smoke-test.sh api          # login + rutes publiques
#   ./scripts/smoke-test.sh downloaded   # injecta media.downloaded (salta qBittorrent)
#   ./scripts/smoke-test.sh transcoded   # injecta media.transcoded (salta Tdarr)
#   ./scripts/smoke-test.sh status       # que ha quedat a la BD
set -uo pipefail

cd "$(dirname "$0")/.."
set -a; . ./.env; set +a

API="http://localhost:${CORE_API_PORT}"
NATSBOX="natsio/nats-box:latest"
PASS=0; FAIL=0

ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; PASS=$((PASS+1)); }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$*"; FAIL=$((FAIL+1)); }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
head_() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
uuid() { cat /proc/sys/kernel/random/uuid; }

# La xarxa de compose, deduida del contenidor nats (te container_name fix).
net() {
  docker inspect nats --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' 2>/dev/null
}

# Publica a NATS des d'un contenidor efimer dins la xarxa de compose.
natspub() {
  local subject="$1" payload="$2" n
  n="$(net)"
  [ -z "$n" ] && { bad "nats no esta aixecat"; return 1; }
  docker run --rm --network "$n" "$NATSBOX" \
    nats pub --server "nats://nats:4222" "$subject" "$payload" >/dev/null 2>&1
}

psql_() { docker compose exec -T postgres psql -qtAX -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$1" 2>/dev/null; }

# ---------------------------------------------------------------- preflight
cmd_preflight() {
  head_ "Prerequisits"
  docker plugin ls 2>/dev/null | grep -q 'loki.*true' \
    && ok "plugin de logging Loki instal·lat i actiu" \
    || bad "falta el plugin Loki — TOTS els contenidors petaran a l'arrencada (./scripts/install-loki-docker-driver.sh)"

  for d in library streamable incoming; do
    [ -d "$VIDEOS_PATH/$d" ] && ok "existeix $VIDEOS_PATH/$d" || bad "falta $VIDEOS_PATH/$d"
  done

  head_ "Variables d'entorn buides"
  local empty=0
  while IFS='=' read -r k v; do
    case "$k" in ''|\#*) continue;; esac
    [ -n "$v" ] && continue
    empty=$((empty+1))
    case "$k" in
      TDARR_*_LIBRARY_ID) bad "$k — transcode-worker donara error i res passara de 'queued'";;
      TMDB_API_KEY)       bad "$k — metadata-service no pot enriquir pel·licules/series";;
      JELLYFIN_*)         bad "$k — el refresh de biblioteca de Jellyfin fallara";;
      *)                  bad "$k";;
    esac
  done < .env
  [ "$empty" -eq 0 ] && ok "totes les variables tenen valor"
}

# -------------------------------------------------------------------- infra
cmd_infra() {
  head_ "Contenidors"
  local expected="jellyfin tdarr postgres nats qbittorrent core-api torrent-worker transcode-worker metadata-service loki grafana"
  for c in $expected; do
    local st
    st="$(docker inspect -f '{{.State.Status}}' "$c" 2>/dev/null)"
    case "$st" in
      running) ok "$c running";;
      "")      bad "$c no existeix";;
      *)       bad "$c esta '$st' — docker logs $c";;
    esac
  done

  head_ "Serveis d'infraestructura"
  docker compose exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1 \
    && ok "postgres accepta connexions" || bad "postgres no respon"

  local tables
  tables="$(psql_ "select count(*) from information_schema.tables where table_schema='public';")"
  if [ "${tables:-0}" -gt 15 ] 2>/dev/null; then
    ok "migracions aplicades ($tables taules)"
  else
    bad "esquema incomplet (${tables:-0} taules) — la migracio de Prisma no s'ha aplicat"
  fi

  local n; n="$(net)"
  if [ -n "$n" ] && docker run --rm --network "$n" "$NATSBOX" \
       nats stream info HOMESTREAM_EVENTS --server nats://nats:4222 >/dev/null 2>&1; then
    ok "el stream HOMESTREAM_EVENTS de JetStream existeix"
  else
    bad "el stream HOMESTREAM_EVENTS no existeix — cap servei l'ha creat encara"
  fi

  curl -sf -m 5 "$API/health" >/dev/null && ok "core-api /health" || bad "core-api no respon a $API/health"
}

# ---------------------------------------------------------------------- api
login() {
  curl -sf -m 10 -X POST "$API/api/v1/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_INITIAL_PASSWORD\"}" 2>/dev/null \
  | jq -r '.accessToken // .access_token // empty'
}

cmd_api() {
  head_ "API publica"
  local tok; tok="$(login)"
  if [ -n "$tok" ]; then
    ok "login com a $ADMIN_EMAIL"
  else
    bad "el login ha fallat — l'usuari admin no s'ha sembrat, o les credencials del .env no coincideixen"
    return
  fi
  curl -sf -m 5 "$API/docs" >/dev/null && ok "Swagger a $API/docs" || bad "Swagger no disponible"
  for r in media torrents series genres categories; do
    local code
    code="$(curl -s -o /dev/null -w '%{http_code}' -m 5 -H "Authorization: Bearer $tok" "$API/api/v1/$r")"
    [ "$code" = "200" ] && ok "GET /api/v1/$r → 200" || bad "GET /api/v1/$r → $code"
  done
}

# ------------------------------------------------ injeccio: media.downloaded
# Prova core-api sense qBittorrent: hauria de crear MediaItem + TranscodeJob
# i publicar media.transcode_pending.
cmd_downloaded() {
  head_ "Injecto media.downloaded (salto torrent-worker)"
  local name="${SMOKE_FILE:-Sintel.2010.1080p.BluRay.x264-SMOKE.mkv}"
  local host="$VIDEOS_PATH/library/movies/$name"

  if [ ! -f "$host" ]; then
    warn "no hi ha cap fitxer real a $host"
    warn "core-api nomes desa strings de path, aixi que l'event funcionara igualment,"
    warn "pero Tdarr no trobara res per transcodificar."
  else
    ok "fitxer origen present ($(du -h "$host" | cut -f1))"
  fi

  local size; size="$(stat -c %s "$host" 2>/dev/null || echo 1048576)"
  local payload
  payload="$(jq -nc --arg h "$(uuid | tr -d -)" --arg r "$(uuid)" --arg n "$name" \
    --arg t "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --argjson s "$size" '{
      torrentHash:$h, requestId:$r, contentType:"movie", category:"movies",
      completedAt:$t,
      files:[{relativePath:$n, absolutePath:("/data/library/movies/"+$n),
              sizeBytes:$s, fileExtension:"mkv"}]
    }')"

  natspub "media.downloaded" "$payload" && ok "media.downloaded publicat" || { bad "no s'ha pogut publicar"; return; }

  sleep 3
  local n; n="$(psql_ "select count(*) from media_items where file_path like '%$name';")"
  [ "${n:-0}" -ge 1 ] && ok "core-api ha creat el media_item" \
                      || bad "cap media_item creat — mira: docker logs core-api"
  local j; j="$(psql_ "select count(*) from transcode_jobs tj join media_items mi on mi.id=tj.media_item_id where mi.file_path like '%$name';")"
  [ "${j:-0}" -ge 1 ] && ok "transcode_job creat" || bad "cap transcode_job creat"
}

# ------------------------------------------------- injeccio: media.transcoded
# Prova metadata-service (i el subscriptor de core-api) sense Tdarr.
cmd_transcoded() {
  head_ "Injecto media.transcoded (salto Tdarr + transcode-worker)"
  [ -z "${TMDB_API_KEY:-}" ] && warn "TMDB_API_KEY buit — l'enriquiment fallara pero l'event es consumira igual"

  local row mid
  row="$(psql_ "select mi.id, tj.id from media_items mi join transcode_jobs tj on tj.media_item_id=mi.id order by mi.created_at desc limit 1;")"
  [ -z "$row" ] && { bad "no hi ha cap media_item — executa primer 'downloaded'"; return; }
  mid="${row%%|*}"; local jid="${row##*|}"

  local out="/data/streamable/movies/$(basename "$(psql_ "select file_path from media_items where id='$mid';")")"
  local payload
  payload="$(jq -nc --arg m "$mid" --arg j "$jid" --arg o "$out" \
    --arg t "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '{
      mediaItemId:$m, transcodeJobId:$j, contentType:"movie", outputPath:$o,
      status:"completed", videoCodec:"h264", audioCodec:"aac",
      containerFormat:"matroska", occurredAt:$t
    }')"

  natspub "media.transcoded" "$payload" && ok "media.transcoded publicat per mediaItemId=$mid" \
                                        || { bad "no s'ha pogut publicar"; return; }
  sleep 5
  local st; st="$(psql_ "select status from media_items where id='$mid';")"
  [ "$st" = "ready" ] && ok "core-api ha passat el media_item a 'ready'" \
                      || bad "el media_item es a '$st' (esperava 'ready') — docker logs core-api"
  local md; md="$(psql_ "select count(*) from movie_details where media_item_id='$mid';")"
  [ "${md:-0}" -ge 1 ] && ok "metadata-service ha escrit movie_details" \
                       || bad "cap movie_details — docker logs metadata-service"
}

# ------------------------------------------------------------------- status
cmd_status() {
  head_ "Estat de la base de dades"
  psql_ "select 'media_items', status, count(*) from media_items group by 2
         union all select 'torrents', status::text, count(*) from torrents group by 2
         union all select 'transcode_jobs', status::text, count(*) from transcode_jobs group by 2
         order by 1,2;" | column -t -s'|'
}

case "${1:-all}" in
  preflight)  cmd_preflight;;
  infra)      cmd_infra;;
  api)        cmd_api;;
  downloaded) cmd_downloaded;;
  transcoded) cmd_transcoded;;
  status)     cmd_status;;
  all)        cmd_preflight; cmd_infra; cmd_api; cmd_status;;
  *)          sed -n '2,12p' "$0"; exit 2;;
esac

printf '\n\033[1m%d correctes, %d fallades\033[0m\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
