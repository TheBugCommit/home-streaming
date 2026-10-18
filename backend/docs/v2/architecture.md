# Arquitectura v2

## Un sol backend Go

Tota la lògica del servidor viu en un únic mòdul Go, `../..`, que compila a un sol binari. No hi
ha microserveis ni comunicació per xarxa entre components interns: tot són crides a funcions dins
del mateix procés.

```
backend/
  cmd/server/main.go          # arrencada: config, migracions, pool de workers, servidor HTTP
  internal/
    config/                   # càrrega i validació de variables d'entorn (fail-fast)
    http/                     # router, handlers, middleware (auth, logging, CORS, errors)
    auth/                     # JWT, hash de contrasenyes (argon2id), refresh tokens
    users/                    # comptes i rols
    catalog/                  # media_items, series, seasons, episodes, gèneres
    torrents/                 # adaptador de qBittorrent + vigilància de descàrregues
    transcode/                # perfils, execució d'ffmpeg, parsing de progrés
    metadata/                 # client de TMDb + client de Jellyfin + resolució d'identitat
    library/                  # contracte de directoris, move/rename, esborrat
    jobs/                     # cua de feines genèrica sobre Postgres
    store/                    # accés a dades (pgx/sqlc) i repositoris
    migrations/               # fitxers SQL versionats
```

### Capa d'accés a dades

Postgres és propietat exclusiva del backend (igual que v1, però ara ningú més hi parla perquè no hi
ha altres serveis). Es fan servir:

- **`pgx`** com a driver i pool de connexions.
- **Migracions SQL** versionades (buit-in o amb `golang-migrate`), aplicades a l'arrencada.
- Opcionalment **`sqlc`** per generar codi tipat de consultes; si no, repositoris escrits a mà.

No hi ha ORM pesant: l'esquema és explícit i les consultes són visibles.

### Configuració i injecció de dependències

- **Configuració** (`../../internal`): totes les variables d'entorn es llegeixen **una sola vegada**
  i es validen a l'arrencada, retornant una estructura tipada (`config.Config`). Cap altre paquet
  crida `os.Getenv`. Els errors es recullen tots junts i el procés falla ràpid si en falta cap o n'hi
  ha de mal formats. `../../.env` es carrega amb `godotenv` només com a comoditat de desenvolupament (no
  sobreescriu variables ja definides, així que l'entorn del contenidor sempre mana).
- **Injecció de dependències** sense *framework*: cada component depèn de les seves **interfícies**
  (ports) i les rep per constructor. El *composition root* és `../../internal` (`app.New`): l'únic lloc
  que coneix les implementacions concretes i les connecta. `main` només carrega la config, munta el
  logger, captura senyals i crida `app.Run`.
- Això manté les dependències apuntant cap endins, fa els paquets provables (es pot injectar un
  *fake* de `qbittorrent.Client`) i evita estat global. Per a grafs grans es pot adoptar
  `google/wire` (generació de codi) sense canviar els constructors.

## Per què no NATS

A v1, NATS existia perquè hi havia microserveis que no es podien cridar directament. Amb un monòlit,
comunicar-se per un bus extern seria afegir infraestructura per resoldre un problema que ja no
existeix. El que es necessitava de NATS era:

1. **Fiabilitat**: que un reinici no perdés feina en curs.
2. **Desacoblament**: separar qui engega la feina de qui la fa.

Tots dos punts es resolen amb una **cua de feines dins de Postgres**:

```sql
-- Reclamar una feina de manera atòmica i concurrent-segura
UPDATE jobs
   SET status = 'running', started_at = now(), attempts = attempts + 1
 WHERE id = (
   SELECT id FROM jobs
    WHERE status = 'queued' AND run_after <= now()
    ORDER BY priority DESC, created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1
 )
RETURNING *;
```

Els workers són goroutines dins del mateix procés que fan *polling* sobre aquesta taula. Un reinici
del backend no perd feina: les files segueixen a la base de dades i es tornen a reclamar.

Tipus de feina (`jobs.kind`):

| kind | descripció |
|---|---|
| `poll_torrent` | refrescar l'estat d'un torrent a qBittorrent |
| `on_download_complete` | enumerar fitxers i crear `media_items` + feines de transcodificació |
| `transcode` | executar `ffmpeg` per a un fitxer concret |
| `identify` | cercar a TMDb i decidir el nom/destí final |
| `publish` | moure el resultat a `library/` i refrescar Jellyfin |
| `enrich` | llegir la metadada rica de Jellyfin i desar-la |

Els detalls del flux són a [pipeline.md](pipeline.md).

## Disposició de directoris

```
${MEDIA_PATH}/                  # UN sol bind mount cap al backend
  downloads/                    # propietat exclusiva de qBittorrent
    incomplete/
    movies/
    tv/
  staging/                      # sortida d'ffmpeg; NO visible per Jellyfin
    movies/
    tv/
  library/                      # única carpeta que munta Jellyfin (read-only)
    movies/
    tv/
```

- **qBittorrent** només veu `downloads/`.
- **Jellyfin** només veu `library/`, en read-only.
- El **backend** veu tot l'arbre, perquè mou fitxers de `downloads/` → `staging/` → `library/`.

### Per què un sol mount

El nucli refusa `rename(2)` entre punts de muntatge diferents (`EXDEV`) encara que siguin el mateix
sistema de fitxers, perquè compara els *mounts*, no els superblocks. Com que el pas final és un
`rename` de `staging/` a `library/` (aparició atòmica, sense còpies parcials), tot l'arbre ha
d'arribar al backend com **un únic bind mount**. És el mateix parany que documentava v1.

### Per què `staging/` i `library/` separats

Jellyfin no ha de veure mai un fitxer a mig escriure ni sense identificar. `ffmpeg` escriu sempre a
`staging/`; el fitxer només apareix a `library/` amb el nom final (Títol + any, o Sèrie SxxExx) quan
la transcodificació **i** la identificació han acabat. Llavors es refresca la llibreria de Jellyfin.

No calen *hardlinks* com a v1 (allà servien perquè Tdarr vigilava una carpeta). Ara el backend
transcodifica directament des de `downloads/`, que ja és un fitxer complet, i escriu a `staging/`.

## Quick Sync

La transcodificació fa servir la iGPU Intel via Quick Sync (`h264_qsv` / `hevc_qsv`). El backend rep:

- el node de render muntat (`RENDER_DEVICE`, p. ex. `/dev/dri/renderD128`), i
- el grup `render` del host via `group_add` (`RENDER_GID`).

El binari `ffmpeg` ha d'incloure suport QSV (`ffmpeg -hwaccels` ha de llistar `qsv`); la imatge del
backend instal·la una build d'ffmpeg amb `intel-media-driver` / `libmfx`. Si QSV no està disponible,
els perfils poden definir un *fallback* a encoder de CPU (`libx264` / `libx265`).

Vegeu les ordres concretes a [transcoding.md](transcoding.md).

## Frontend

SPA nova, separada del backend. Consumeix l'API REST (vegeu [api.md](api.md)) amb un token JWT. En
desplegament es serveix com a estàtics des d'un contenidor nginx; en desenvolupament corre amb el
seu servidor de desenvolupament i fa proxy cap al backend.
