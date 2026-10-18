# home-streaming v2 — redisseny

Aquest dossier descriu el **redisseny** complet del projecte. Substitueix la documentació de
`docs/` (v1), que es conserva només com a referència històrica.

## Objectiu

Un portal web propi per gestionar una biblioteca domèstica de **pel·lícules i sèries**:

- L'usuari té un compte i pot veure el catàleg.
- Pot **afegir un torrent** (`.torrent` o magnet): es descarrega, es transcodifica, se li posen les
  metadades i s'ubica a la carpeta que Jellyfin indexa.
- Pot **eliminar** una pel·lícula/sèrie del catàleg: s'esborra del disc i es deixa de compartir a
  qBittorrent.
- Pot **transcodificar o re-transcodificar** qualsevol ítem del catàleg amb un altre perfil, encara
  que en el seu moment no s'hagués transcodificat.
- Pot **seguir el progrés en temps real** de cada ítem un cop el posa a descarregar: descàrrega
  (velocitat, ETA, temps transcorregut, seeds…), transcodificació (temps restant, fps…) i indexació,
  i **consultar els errors** si n'hi ha.
- Jellyfin serveix el contingut; el nostre portal només l'organitza i l'enriqueix.

La música queda **fora d'abast** en aquesta fase.

## Decissions preses

| Tema | Decisió |
|---|---|
| Backend | **Un sol binari Go (monòlit)**. S'eliminen els microserveis. |
| Llenguatge | Tot el backend en **Go**; el frontend és l'única peça que no és Go. |
| Comunicació interna | **Sense NATS ni bus de missatges.** Cua de feines dins de Postgres. |
| Transcoder | **Sense Tdarr.** El backend executa `ffmpeg` directament. |
| Perfil de transcodificació | **Triable per l'usuari en pujar el torrent**, i també des del catàleg per transcodificar o re-transcodificar un ítem existent. |
| Base de dades | **PostgreSQL** (es manté el contenidor). |
| Metadades | **Híbrid**: TMDb per identificar i anomenar, Jellyfin per enriquir (vegeu `metadata.md`). |
| Frontend | **Nou**, parla amb l'API del backend Go. |
| Contingut | Només **pel·lícules i sèries**. |
| Maquinari | Transcodificació per **Intel Quick Sync** (iGPU), amb fallback a CPU. |

## Què canvia respecte de v1

| v1 | v2 |
|---|---|
| `core-api` (NestJS/TS) | Un paquet `http` dins del monòlit Go |
| `torrent-worker`, `transcode-worker`, `metadata-service` | Paquets interns del monòlit (`torrents`, `transcode`, `metadata`) |
| NATS JetStream + contractes d'esdeveniments | Cua de feines (`jobs`) a Postgres, `FOR UPDATE SKIP LOCKED` |
| Tdarr (transcodifica desacoblada) | `ffmpeg` invocat pel propi backend |
| Postgres + NATS + Tdarr + Jellyfin + qBittorrent | Postgres + Jellyfin + qBittorrent (+ backend/frontend) |
| Prisma (schema a `schema.prisma`) | Migracions SQL + accés amb `pgx`/`sqlc` |
| Només TMDb + MusicBrainz | TMDb (identificació) + Jellyfin (enriquiment) |
| Un únic admin, sense CRUD d'usuaris | Comptes d'usuari amb rols |

## Arquitectura en una ullada

```
   ┌──────────────┐   REST/JSON    ┌──────────────────────────────────────────────┐
   │  frontend    │◀──────────────▶│                backend (Go)                  │
   │  (nou SPA)   │                │                                              │
   └──────────────┘                │  http ─ auth ─ users ─ catalog               │
                                   │                                              │
                                   │  torrents ──▶ qBittorrent (Web API)          │
                                   │  transcode ─▶ ffmpeg (QSV/CPU)               │
                                   │  metadata ──▶ TMDb + Jellyfin                 │
                                   │  library ───▶ filesystem (downloads/staging/ │
                                   │                library)                       │
                                   │  jobs ──────▶ cua dins Postgres              │
                                   └───────────────┬──────────────────────────────┘
                                                   │
                          ┌────────────────────────┼───────────────────────┐
                          ▼                        ▼                       ▼
                    ┌──────────┐            ┌──────────────┐        ┌────────────┐
                    │ Postgres │            │ qBittorrent  │        │  Jellyfin  │
                    └──────────┘            └──────────────┘        └────────────┘
```

## Documents

- **[architecture.md](architecture.md)** — estructura del monòlit Go, paquets, cua de feines a
  Postgres, disposició de directoris, Quick Sync.
- **[pipeline.md](pipeline.md)** — el flux complet, pas a pas, des que es puja un torrent fins que
  Jellyfin l'indexa, i què passa en eliminar.
- **[data-model.md](data-model.md)** — esquema Postgres v2: taules, camps i relacions.
- **[api.md](api.md)** — taula de rutes REST de l'API del backend.
- **[transcoding.md](transcoding.md)** — perfils de transcodificació, ordres `ffmpeg`, progrés,
  subtítols i errors.
- **[metadata.md](metadata.md)** — identificació amb TMDb, enriquiment amb Jellyfin i la resposta a
  «podem agafar les metadades directament de Jellyfin?».
- **[deployment.md](deployment.md)** — `docker-compose`, variables d'entorn, volums i pla de
  migració des de v1.
