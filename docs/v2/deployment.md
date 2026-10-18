# Desplegament v2

## Serveis (docker-compose)

| servei | imatge / build | ports | notes |
|---|---|---|---|
| `jellyfin` | `jellyfin/jellyfin:latest` | 8096 | munta `library/` en **read-only**; QSV amb el node de render |
| `postgres` | `postgres:16-alpine` | *(intern)* | única base de dades; migracions a l'arrencada del backend |
| `qbittorrent` | `lscr.io/linuxserver/qbittorrent:latest` | 8080, 6881 | munta `downloads/` |
| `backend` | `./backend` | API (p. ex. 3000) | Go + `ffmpeg`/`ffprobe` amb QSV; munta tot `${MEDIA_PATH}` |
| `frontend` | `./frontend` | 80 | SPA estàtica servida per nginx |

S'eliminen respecte de v1: `nats`, `core-api`, `torrent-worker`, `transcode-worker`,
`metadata-service` i qualsevol contenidor de Tdarr.

```
services:
  jellyfin:
    volumes:
      - ${MEDIA_PATH}/library:/media:ro
    devices:
      - ${RENDER_DEVICE}:${RENDER_DEVICE}      # mateixa ruta dins del contenidor; no es pot renombrar
    group_add:
      - "${RENDER_GID}"

  qbittorrent:
    volumes:
      - ${MEDIA_PATH}/downloads:/data/downloads

  backend:
    build: ./backend
    volumes:
      - ${MEDIA_PATH}:/data            # UN sol mount (rename atòmic)
    devices:
      - ${RENDER_DEVICE}:${RENDER_DEVICE}
    group_add:
      - "${RENDER_GID}"
```

## Layout de directoris

```
${MEDIA_PATH}/
  downloads/{incomplete,movies,tv}   # qBittorrent
  staging/{movies,tv}                # sortida ffmpeg
  library/{movies,tv}                # Jellyfin
```

`${MEDIA_PATH}` ha d'arribar al backend com a **un únic bind mount** perquè `rename` de `staging/` a
`library/` sigui atòmic (vegeu [architecture.md](architecture.md)).

## Variables d'entorn

| variable | servei | propòsit |
|---|---|---|
| `DATABASE_URL` | backend | connexió a Postgres |
| `JWT_SECRET` | backend | signatura dels access tokens |
| `ACCESS_TOKEN_TTL` / `REFRESH_TOKEN_TTL` | backend | durades |
| `ADMIN_EMAIL` / `ADMIN_INITIAL_PASSWORD` | backend | bootstrap de l'admin |
| `MEDIA_PATH` | compose/backend | arrel dels directoris |
| `QBITTORRENT_URL` / `_USERNAME` / `_PASSWORD` | backend | accés a la Web API |
| `TMDB_API_KEY` | backend | identificació (TMDb) |
| `JELLYFIN_URL` / `JELLYFIN_API_KEY` | backend | refresc i read-back |
| `JELLYFIN_MOVIES_LIBRARY_ID` / `_TV_LIBRARY_ID` | backend | refresc dirigit |
| `RENDER_DEVICE` / `RENDER_GID` | compose | Quick Sync (host-specific) |
| `TZ` | backend/qbittorrent/jellyfin | zona horària |

## Imatge del backend

Ha d'incloure:

- El binari Go compilat (build multi-stage).
- `ffmpeg` i `ffprobe` amb suport QSV (`intel-media-driver`, `libmfx`, `va-driver`).
- Accés al node de render i al grup `render`.

Comprovació a l'arrencada: `ffmpeg -hwaccels` ha de llistar `qsv`; si no, s'avisa i s'activa el
fallback a CPU.

## Desplegament local

1. Copiar `.env.example` a `.env` i omplir secrets i `TMDB_API_KEY` / `JELLYFIN_API_KEY`.
2. `docker compose up -d`. El backend aplica les migracions i *seedegen* els perfils de
   transcodificació per defecte.
3. Seed del password de qBittorrent (com a v1): aturar el contenidor, escriure la configuració,
   tornar-lo a arrencar.
4. A Jellyfin: apuntar les llibreries de Movies/TV a `library/movies` i `library/tv`, generar l'API
   key i omplir `JELLYFIN_*` a `.env`.
5. Reiniciar el backend perquè reculli les variables noves.

## Pla de migració des de v1

1. **Aturar** l'stack v1.
2. **Exportar** el que calgui de la base de dades v1 (catàleg), si es vol conservar.
3. **Reorganitzar** `${VIDEOS_PATH}` → `${MEDIA_PATH}` segons el nou layout:
   - `downloads/` es manté.
   - `streamable/` → `library/`.
   - `library/` i `transcoded/` de v1 desapareixen (ja no calen).
4. **Eliminar** del compose: `nats`, `core-api`, `torrent-worker`, `transcode-worker`,
   `metadata-service` i Tdarr.
5. **Afegir** `backend` i `frontend`.
6. Executar les migracions del backend i verificar `GET /health`.
7. Jellyfin apunta ara a `library/`.

## Verificació end-to-end

- `GET /health` — DB, qBittorrent, Jellyfin i disc.
- Pujar un `.torrent` de prova i seguir l'estat del `media_item` a la UI:
  `downloading → transcoding → transcoded → identifying → publishing → ready`.
- Comprovar que el fitxer apareix a `library/`, que Jellyfin l'ha indexat amb metadades i que
  qBittorrent continua compartint.
- Esborrar l'ítem i comprovar que desapareix del disc, de Jellyfin i de qBittorrent.
