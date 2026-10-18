# home-streaming

Portal domèstic per gestionar una biblioteca de **pel·lícules i sèries**. El backend és un únic
servei en **Go** (sense microserveis, sense NATS: `ffmpeg` directe), amb un frontend
separat i metadades híbrides **TMDb + Jellyfin**.

## Flux

```
pujar torrent ─▶ descàrrega (qBittorrent) ─▶ transcodificació (ffmpeg, perfil triable)
      ─▶ identificació (TMDb) ─▶ publicació a library/ ─▶ indexació + enriquiment (Jellyfin)
```

- L'usuari té compte i pot veure el catàleg, **afegir torrents** i **eliminar** contingut.
- Eliminar un ítem del catàleg treu el fitxer del disc, atura la compartició a qBittorrent i el
  desindexa de Jellyfin.
- Un ítem ja existent es pot **transcodificar o re-transcodificar** amb un altre perfil.

La música queda fora d'abast en aquesta fase.

## Estat

En construcció. El disseny complet és a **[docs/v2/](docs/v2/README.md)**. El codi v1 (microserveis
NestJS/Go/Python, NATS, frontend antic) s'ha eliminat.

## Infraestructura

`docker-compose.yml` arrenca `jellyfin`, `postgres` i `qbittorrent`. Els serveis `backend` i
`frontend` s'afegiran durant el scaffold de v2.

### Primers passos (infra)

1. Copiar `.env.example` a `.env` i omplir els secrets, `TMDB_API_KEY` i `JELLYFIN_API_KEY`.
2. `docker compose up -d`.
3. Seed del password de qBittorrent amb `scripts` (amb el contenidor
   **aturat**):
   ```
   docker compose stop qbittorrent
   python3 scripts/seed-qbittorrent-password.py
   docker compose up -d qbittorrent
   ```
4. A Jellyfin (`http://localhost:8096`), apuntar les llibreries de Movies TV a `library/movies` i
   `library/tv`, generar una API key i omplir les variables `JELLYFIN_*` de `.env`.

## Disposició de directoris

```
${MEDIA_PATH}/
  downloads/{incomplete,movies,tv}   # qBittorrent
  staging/{movies,tv}                # sortida ffmpeg (no visible per Jellyfin)
  library/{movies,tv}                # final; Jellyfin (read-only)
```

Tot `${MEDIA_PATH}` ha d'arribar al backend com **un únic bind mount**, perquè el `rename` de
`staging/` a `library/` sigui atòmic.
