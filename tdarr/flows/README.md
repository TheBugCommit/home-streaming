# Tdarr Libraries & Flow (manual configuration)

Tdarr's Libraries and Flows live in its own internal DB (`tdarr/server`, gitignored), not in this
repo's code — `transcode-worker` never configures Tdarr, it only polls Tdarr's API to correlate a
known file with its job status (see `services/transcode-worker`). Configure this once via the Tdarr
web UI at `http://localhost:8265`, then export each Flow here for reproducibility.

## Libraries (Settings → Libraries)

| name | source folder | output folder |
|---|---|---|
| Movies | `/data/library/movies` | `/data/streamable/movies` |
| TV | `/data/library/tv` | `/data/streamable/tv` |
| Music | `/data/library/music` | `/data/streamable/music` |

TV reuses the same Flow as Movies (episodes have identical encode requirements to movies; only the
folder differs).

## Movies/TV Flow — target: no live transcode required, smaller without visible quality loss

Production (dedicated server, **no GPU**) — CPU-only:
```
-c:v libx264 -crf 21 -preset medium -profile:v high -level 4.1 -c:a aac -b:a 192k
```
- Container: MKV. Codec: H.264 High Profile (broadest direct-play compatibility across clients —
  wider than HEVC, which not every client decodes without hardware support).
- No resolution downscaling — the ask is "smaller without quality loss," not "lower resolution."
- Add a pre-check step in the Flow: if the source is already H.264 High + AAC in MKV/MP4, skip
  re-encoding (`status: skipped` in `transcode_jobs`) rather than re-encoding a no-op.
- `preset medium` is the starting tradeoff between CPU time and compression on a GPU-less host —
  tune down to `fast` if the transcode queue backs up, or up to `slow` if there's headroom.

Local dev only (this machine's RTX 2050, via `docker-compose.gpu.local.yml`):
```
-c:v h264_nvenc -rc vbr -cq 20 -b:v 0 -profile:v high -level 4.1 -c:a aac -b:a 192k
```

## Music Flow

Normalize container/tags only — no lossy re-encode (audio direct-play concurrency load is trivial
compared to video; re-encoding lossy-to-lossy audio only loses quality for no real benefit here).

## After building each Flow

Export it (Flow menu → Export) and commit the JSON here as `movies-tv.flow.json` /
`music.flow.json` so it can be re-imported on a fresh Tdarr instance instead of only living in the
gitignored `tdarr/server` DB.
