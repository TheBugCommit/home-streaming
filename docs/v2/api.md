# API REST v2

Prefixa global `/api/v1` (exclòs `GET /health`). Respostes JSON. Autenticació per JWT
(`Authorization: Bearer <token>`); els endpoints d'administració requereixen rol `admin`.

## Autenticació

| mètode | ruta | rol | notes |
|---|---|---|---|
| POST | `/auth/login` | — | `{ email, password }` → `{ user, accessToken, refreshToken }` |
| POST | `/auth/refresh` | — | `{ refreshToken }` → parell nou (l'antic es revoca) |
| POST | `/auth/logout` | usuari | revoca el refresh token |
| GET | `/auth/me` | usuari | perfil de l'usuari actual |

## Usuaris

| mètode | ruta | rol | notes |
|---|---|---|---|
| GET | `/users` | admin | llista |
| POST | `/users` | admin | `{ email, password, displayName, role }` |
| PATCH | `/users/:id` | admin | `{ displayName?, role?, isActive? }` |
| DELETE | `/users/:id` | admin | desactiva/elimina |

> L'admin inicial es crea a l'arrencada des de `ADMIN_EMAIL`/`ADMIN_INITIAL_PASSWORD`. El registre
> públic està desactivat per defecte; els comptes els crea un admin.

## Catàleg

| mètode | ruta | rol | notes |
|---|---|---|---|
| GET | `/media` | usuari | filtres: `type`, `status`, `genreId`, `seriesId`; paginat (`page`, `pageSize`) |
| GET | `/media/:id` | usuari | detall |
| PATCH | `/media/:id` | admin | edició de camps de catàleg (p. ex. `title`) |
| POST | `/media/:id/transcode` | admin | encua una transcodificació (o re-transcodificació) amb `{ transcodeProfileId }` |
| DELETE | `/media/:id` | admin | esborra fitxer + torrent si escau + refresc Jellyfin |
| GET | `/series` | usuari | |
| GET | `/series/:id` | usuari | inclou temporades i episodis |
| GET | `/genres` | usuari | |

> `POST /media/:id/transcode` serveix tant per a ítems que **mai** s'han transcodificat (p. ex.
> afegits amb el perfil `original`/`remux_mp4`) com per a **re-transcodificar** un ítem ja `ready`
> amb un altre perfil. Vegeu [pipeline.md](pipeline.md#transcodificar-un-ítem-del-catàleg).

## Progrés i errors

| mètode | ruta | rol | notes |
|---|---|---|---|
| GET | `/media/:id/progress` | usuari | estat unificat de les tres etapes amb mètriques i errors |
| GET | `/media/:id/events` | usuari | flux **SSE** d'actualitzacions de progrés i errors |
| GET | `/media/:id/events?level=error` | usuari | només els errors (històric complet) |
| GET | `/torrents/:id/progress` | admin | mètriques de descàrrega en cru de qBittorrent |

`GET /media/:id/progress` retorna totes les etapes alhora:

```json
{
  "mediaItemId": "…",
  "status": "transcoding",
  "stages": {
    "download": {
      "status": "completed",
      "progressPercent": 100,
      "downloadedBytes": 12884901888,
      "totalBytes": 12884901888,
      "downloadSpeedBps": 0,
      "etaSeconds": 0,
      "seeders": 14,
      "elapsedSeconds": 820,
      "errors": []
    },
    "transcode": {
      "status": "transcoding",
      "progressPercent": 37,
      "etaSeconds": 512,
      "speedX": 2.4,
      "fps": 48.1,
      "elapsedSeconds": 301,
      "errors": []
    },
    "indexing": {
      "status": "pending",
      "step": null,
      "steps": ["identify", "publish", "enrich"],
      "confidenceScore": null,
      "errors": []
    }
  },
  "errors": []
}
```

> El frontend pot fer servir el flux SSE (`/media/:id/events`) per actualitzar la UI en directe, o
> consultar `/media/:id/progress` periòdicament. Els errors surten a `stages.*.errors` i, de manera
> agregada, a `errors`; cada error inclou `stage`, `level`, `message` i `details` (p. ex. el log
> d'ffmpeg o el missatge del tracker).

## Torrents i descàrregues

| mètode | ruta | rol | notes |
|---|---|---|---|
| POST | `/torrents` | admin | `multipart`: `file` (`.torrent`) **o** `magnet`, `contentType`, `transcodeProfileId` |
| GET | `/torrents` | admin | |
| GET | `/torrents/:id` | admin | estat i `media_items` associats |
| DELETE | `/torrents/:id` | admin | elimina torrent + fitxers de qBittorrent |

## Perfils de transcodificació

| mètode | ruta | rol | notes |
|---|---|---|---|
| GET | `/transcode-profiles` | usuari | llista per al selector de la UI |
| POST | `/transcode-profiles` | admin | crear perfil |
| PATCH | `/transcode-profiles/:id` | admin | editar |
| DELETE | `/transcode-profiles/:id` | admin | eliminar |

## Feines (observabilitat)

| mètode | ruta | rol | notes |
|---|---|---|---|
| GET | `/jobs` | admin | filtres per `kind`, `status` |
| GET | `/jobs/:id` | admin | |
| POST | `/jobs/:id/retry` | admin | reencua una feina fallida |

## Jellyfin

| mètode | ruta | rol | notes |
|---|---|---|---|
| GET | `/jellyfin/libraries` | admin | llibreries configurades |
| POST | `/jellyfin/refresh` | admin | força un refresc (opcionalment per id de llibreria) |

## Salut

| mètode | ruta | notes |
|---|---|---|
| GET | `/health` | sense prefix ni auth; comprova DB, qBittorrent, Jellyfin i accés a disc |
