# Flux de la pipeline

Aquest document descriu el camí complet d'un torrent, des que l'usuari el puja fins que Jellyfin
l'indexa, i què passa en eliminar contingut. L'estat de cada `media_item` avança per aquests valors:

```
queued → downloading → downloaded → transcoding → transcoded → identifying → publishing → ready
                                                                                        ↘ failed
```

## 1. Pujada (`POST /api/torrents`)

El frontend envia `multipart/form-data`:

- `file` — el `.torrent` (o bé `magnet`, una URL en text).
- `contentType` — `movie` o `tv`.
- `transcodeProfileId` — el perfil de transcodificació triat per l'usuari.

El backend:

1. Valida l'entrada i crea una fila a `torrents` amb `status = 'queued'`.
2. Puja el torrent a qBittorrent via la seva Web API, amb una categoria (`movies` o `tv`) que
   determina el `savePath` dins de `downloads/`.
3. Desa el `qbittorrent_hash` a la fila del torrent.
4. Engega una feina `poll_torrent` per a aquest torrent.

## 2. Descàrrega

Una feina `poll_torrent` consulta qBittorrent periòdicament i actualitza `progressPercent` i
`status` (`queued → downloading`). Quan el torrent arriba a l'estat «completat»:

1. S'enumera la llista de fitxers descarregats.
2. S'engega una feina `on_download_complete`.

> Alternativa: qBittorrent pot enviar un *webhook* de completat; si s'activa, es pot prescindir del
> polling. El disseny per defecte és polling (més simple i sense dependre de la configuració de
> qBittorrent), amb el webhook com a optimització opcional. El polling és, a més, el que alimenta les
> mètriques de descàrrega en directe (velocitat, ETA, seeds) de la UI; vegeu
> [Seguiment del progrés i errors](#seguiment-del-progrés-i-errors).

## 3. Creació d'ítems de catàleg

A `on_download_complete`, per a **cada fitxer de vídeo**:

1. Es crea un `media_item` (`type = movie` o `episode`), associat al torrent.
2. Es determina el `sourcePath` dins de `downloads/`.
3. Es crea una fila a `transcode_jobs` amb el perfil triat i estat `queued`.
4. S'engega una feina `transcode`.

Un torrent *season pack* genera **molts** `media_items` (un per episodi). Un torrent de pel·lícula,
normalment un. (`episodes` es relacionen amb `series`/`seasons` quan la identificació ho resol.)

## 4. Transcodificació

El worker de transcodificació:

1. Reclama la feina `transcode`.
2. Llegeix el perfil i construeix l'ordre `ffmpeg`.
3. Executa `ffmpeg` amb `-progress pipe:1`, parseja el progrés i l'escriu a `transcode_jobs.progress`
   i `media_items.status = 'transcoding'`.
4. La sortida va a `staging/{movies,tv}/...`.
5. En acabar correctament, `status = 'transcoded'` i s'engega `identify`.

Vegeu ordres i perfils a [transcoding.md](transcoding.md).

## 5. Identificació i metadades (TMDb)

La feina `identify`:

1. Parseja títol i any del nom del torrent/fitxer (per a sèries, extreu temporada i episodi).
2. Cerca a TMDb i tria el millor resultat (puntuació de confiança; vegeu [metadata.md](metadata.md)).
3. Desa `tmdb_id`, títol canònic, any i, per a sèries, `series`/`season`/episodi.
4. Decideix el **nom i destí final** dins de `library/`:
   - Pel·lícula: `library/movies/<Títol> (<Any>)/<Títol> (<Any>) <tmdbid>.<ext>`
   - Episodi: `library/tv/<Sèrie>/Season NN/<Sèrie> - SxxEyy - <Títol episodi>.<ext>`
5. Engega `publish`.

## 6. Publicació i refresc de Jellyfin

La feina `publish`:

1. Fa `rename(2)` del fitxer de `staging/` a la ruta final dins de `library/` (atòmic, mateix mount).
2. Actualitza `media_items.filePath` i `status = 'ready'`.
3. Demana a Jellyfin un refresc de la llibreria (o de l'ítem concret) via
   `POST /Library/Refresh` o `/Items/{id}/Refresh`.
4. Engega `enrich`.

## 7. Enriquiment (Jellyfin)

Jellyfin escaneja el fitxer ja ben anomenat i descarrega metadades riques dels seus proveïdors
(TMDb/TVDB via els seus plugins). La feina `enrich`:

1. Espera que la indexació acabi (polling o esdeveniment de Jellyfin).
2. Llegeix l'ítem de Jellyfin per trobar la metadada rica (sinopsi, imatges, repartiment, gèneres).
3. Desa el `jellyfin_item_id` i, si cal, la resta de camps (o serveix les imatges directament des de
   Jellyfin). Estat final: `ready`.

El detall i la justificació d'aquest repartiment TMDb/Jellyfin són a [metadata.md](metadata.md).

## Transcodificar un ítem del catàleg

Des del catàleg, un admin pot demanar transcodificar un `media_item` ja existent
(`POST /api/media/:id/transcode` amb `{ transcodeProfileId }`). Cobreix dos casos:

- **Ítem que mai s'ha transcodificat**: es va afegir amb un perfil `original` / `remux_mp4` (o importat
  directament a `library/`), de manera que el fitxer actual és el de la font. Ara es vol convertir.
- **Re-transcodificació**: l'ítem ja és `ready` i es vol canviar de perfil (p. ex. passar de
  `h264_1080p` a `hevc_1080p`, o reduir a 720p).

Com funciona:

1. Es pren el **fitxer actual** com a `sourcePath` (si l'estat és `ready`) o el fitxer de `downloads/`
   si encara no s'ha publicat.
2. Es crea un `transcode_job` nou amb el perfil triat (un `media_item` pot tenir **diverses**
   transcodificacions al llarg del temps).
3. El resultat s'escriu a `staging/`; quan acaba, l'ítem passa per `identifying` (reutilitza la
   identitat ja resolta a TMDb, si n'hi ha) i `publishing`.
4. A `publish`, el nou fitxer substitueix l'antic a `library/` (es conserva el nom final; l'antic
   s'esborra) i es refresca Jellyfin.

> Si l'ítem té el mateix `sourcePath` com a origen i destí, la feina es marca `skipped`.

Els valors d'estat tornen enrere de manera coherent: un ítem `ready` que es re-transcodifica passa a
`transcoding` i, en acabar, torna a `ready`.

## Seguiment del progrés i errors

Quan un ítem entra a la pipeline, la UI del catàleg en mostra el progrés en directe, etapa per etapa.
El backend no guarda una única xifra de «%» global: exposa **mètriques per etapa** (perquè les
descàrregues i les transcodificacions tenen escales de temps molt diferents) i consolida els errors.

### Etapa 1 — Descàrrega (qBittorrent)

Mètriques, obtingudes del polling de qBittorrent:

- `progressPercent`, `downloadedBytes` / `totalBytes`.
- `downloadSpeedBps` / `uploadSpeedBps`.
- **ETA** (`etaSeconds`) i **temps transcorregut**.
- `seeders` / `leechers`.
- `state` intern de qBittorrent (p. ex. `downloading`, `stalledDL`, `checkingDL`, `uploading`).
- Errors: estat d'error del torrent i missatges de tracker (`lastError`).

### Etapa 2 — Transcodificació (ffmpeg)

Mètriques, calculades a partir de `-progress pipe:1`:

- `progressPercent` (en funció de `out_time_us` i la durada).
- **Temps restant** (`etaSeconds`) i temps transcorregut.
- `speedX` (velocitat respecte del temps real) i `fps`.
- Perfil aplicat i codec d'origen/destí.
- Errors: codi de sortida d'ffmpeg ≠ 0, `error` i el `ffmpeg_log` complet.

`etaSeconds` es calcula com `elapsed * (100 - percent) / percent`; és una estimació i pot oscil·lar.

### Etapa 3 — Indexació (identify → publish → enrich)

- Subestat de la feina actual (`identify`, `publish` o `enrich`).
- Resultat de la identificació a TMDb: coincidència triada i `confidenceScore`.
- Errors: cap coincidència, confiança baixa (revisió manual) o fallada en el refresc de Jellyfin.

### Com s'obté i s'exposa

- **En directe**: `GET /media/:id/progress` retorna un estat unificat amb totes les etapes, i
  `GET /media/:id/events` (SSE) emet actualitzacions quan canvien (vegeu [api.md](api.md)).
- **Persistit**: els darrers valors coneguts es desen a `torrents` i `transcode_jobs` (mètriques) i a
  `pipeline_events` (historial i **errors**), de manera que la UI pot mostrar l'estat encara que el
  backend s'hagi reiniciat i es pot veure l'històric complet d'un ítem.
- **Errors**: cada error s'afegeix a `pipeline_events` amb `level = 'error'` i el detall; la UI els
  pot llistar i mostrar (p. ex. el log d'ffmpeg o el missatge del tracker). També es consulten via
  `GET /media/:id/events?level=error`.

## Eliminar contingut (`DELETE /api/media/:id`)

En eliminar un ítem del catàleg:

1. S'esborra el fitxer de `library/` (i qualsevol còpia de `staging/` si encara existia).
2. Si el `torrent` associat no té cap més `media_item`, es demana a qBittorrent que elimini el
   torrent **i els seus fitxers** (`torrents/delete?deleteFiles=true`), cosa que atura la
   compartició i allibera `downloads/`.
3. S'esborren (o s'arxiven) les files de `media_items`, `transcode_jobs`, `episodes`, etc.
4. Es refresca Jellyfin perquè tregui l'ítem de la llibreria.

Així, eliminar de l'aplicació equival a: **treure del disc + deixar de compartir a qBittorrent +
desindexar de Jellyfin**, que és exactament el comportament demanat.
