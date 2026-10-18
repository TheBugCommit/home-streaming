# Transcodificació amb ffmpeg

Ja no hi ha Tdarr. El backend executa `ffmpeg` directament per a cada fitxer, segons el **perfil triat
per l'usuari en pujar el torrent**.

## Perfils

Un perfil descriu com s'ha de transcodificar (vegeu la taula `transcode_profiles` a
[data-model.md](data-model.md)). Perfils per defecte proposats:

| name | container | vídeo | qualitat | àudio | notes |
|---|---|---|---|---|---|
| `original` | = font | `copy` | — | `copy` | no transcodifica; només canvia el nom i publica |
| `remux_mp4` | `mp4` | `copy` | — | `copy` | canvi de contenidor sense re-encodar (ràpid) |
| `h264_1080p` | `mp4` | `h264` (qsv) | `global_quality 22` | `aac 192k` | **per defecte**; màxima compatibilitat |
| `h264_720p` | `mp4` | `h264` (qsv) | `global_quality 23`, màx. 1280×720 | `aac 160k` | estalvi d'espai |
| `hevc_1080p` | `mkv` | `hevc` (qsv) | `global_quality 24` | `aac 192k` | millor compressió, menys suport universal |

L'usuari tria el perfil al formulari de pujada; `h264_1080p` surt seleccionat per defecte.

## Ordre d'exemple (H.264 QSV → MP4)

```bash
ffmpeg -hide_banner -y -nostdin \
  -hwaccel qsv -hwaccel_output_format qsv \
  -i "$SOURCE" \
  -map 0:v:0 -map 0:a \
  -c:v h264_qsv -preset medium -global_quality 22 \
  -c:a aac -b:a 192k \
  -movflags +faststart \
  -progress pipe:1 -nostats \
  "$OUTPUT"
```

HEVC (per a MP4/Apple cal `hvc1`):

```bash
ffmpeg -hide_banner -y -nostdin \
  -hwaccel qsv -hwaccel_output_format qsv -i "$SOURCE" \
  -map 0:v:0 -map 0:a \
  -c:v hevc_qsv -preset medium -global_quality 24 -tag:v hvc1 \
  -c:a aac -b:a 192k \
  -progress pipe:1 -nostats "$OUTPUT.mkv"
```

Remux (sense re-encodar):

```bash
ffmpeg -hide_banner -y -nostdin -i "$SOURCE" \
  -map 0 -c copy -movflags +faststart -progress pipe:1 -nostats "$OUTPUT"
```

## Escalat

`.max_width`/`.max_height` afegeixen un `scale`. Amb QSV cal fer servir el filtre de QSV:

```bash
-vf "scale_qsv=w=1280:h=720:force_original_aspect_ratio=decrease"
```

Amb encoder de CPU seria `scale=1280:-2`.

## Fallback a CPU

Si QSV no és disponible (`ffmpeg -hwaccels` no llista `qsv`, o falla en obrir el dispositiu), el
perfil pot especificar un encoder de CPU (`libx264` / `libx265`). El backend detecta l'error
`Cannot load libmfx` / `Device creation failed` i reintenta amb el fallback, marcant-ho al log.

## Progrés

`-progress pipe:1` escriu línies `clau=valor` a stdout. El backend llegeix `out_time_us` i el compara
amb la durada total (`ffprobe -show_entries format=duration`) per calcular el percentatge, que escriu
a `transcode_jobs.progress_percent` i exposa a la UI.

Exemple de parsing:

```
frame=...
out_time_us=12345678
progress=continue      # o progress=end
```

## Àudio i subtítols

- **Àudio**: `copy` per conservar pistes originals, o `aac` amb bitrate/canals concrets (downmix a 2.0
  per compatibilitat).
- **Subtítols**: `subtitle_mode`
  - `copy` — copiar pistes al contenidor (`-c:s mov_text` per MP4).
  - `burn` — incrustar (`-vf subtitles=...`), útil quan el client no suporta subtítols externs.
  - `none` — descartar.

## Transcodificar des del catàleg

A més de triar el perfil en pujar un torrent, el catàleg ofereix l'acció
`POST /api/media/:id/transcode` amb `{ transcodeProfileId }`. Serveix per a:

- Ítems **mai transcodificats** (afegits amb `original` / `remux_mp4`): ara se'ls aplica un perfil real.
- **Re-transcodificacions** d'un ítem `ready` amb un altre perfil.

Cada acció crea una fila nova a `transcode_jobs` per a aquell `media_item` (n'hi pot haver diverses al
llarg del temps). El `sourcePath` és el fitxer actual de l'ítem; el resultat passa per `staging/` i
substitueix l'antic a `library/` en publicar. Vegeu
[pipeline.md](pipeline.md#transcodificar-un-ítem-del-catàleg).

## Errors i reintents

- Codi de sortida d'ffmpeg ≠ 0 → `transcode_jobs.status = 'failed'`, es desa `ffmpeg_log` i `error`.
- La feina `transcode` es pot reintentar (backoff) fins a `max_attempts`; si falla definitivament,
  el `media_item` passa a `failed` i queda visible a la UI per a revisió manual.
- Els fitxers parcials de `staging/` s'esborren en cas de fallada.

## Requisits de la imatge

El contenidor del backend ha de portar `ffmpeg` amb suport QSV (`intel-media-driver`, `libmfx`),
`ffprobe`, accés al node de render i el grup `render`. Vegeu [deployment.md](deployment.md).
