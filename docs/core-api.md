# core-api (TypeScript / NestJS)

Owns Postgres exclusively, issues both auth mechanisms, exposes the public REST API, and
orchestrates the pipeline via NATS. See `docs/architecture.md` for the hexagonal-layering rationale
and `docs/data-model.md` for the schema; this document covers the concrete file map, auth, routes,
and logging.

## File map

```
src/
  domain/                     # entities + repository "port" interfaces — framework-free
    media/media-item.entity.ts, media-item-repository.port.ts
    torrents/torrent.entity.ts
    transcode/transcode-job.entity.ts
    users/user.entity.ts
    auth/api-key.entity.ts, refresh-token.entity.ts
    categories/category.entity.ts
    series/series.entity.ts
    events/events.ts           # TS types mirroring shared/events/schemas/*.json
  application/                 # one use-case class per action
    media/list-media, get-media-detail, update-media, apply-metadata,
          process-media-downloaded, handle-transcode-events (.use-case.ts)
    torrents/submit-torrent.use-case.ts
    users/authenticate-user.use-case.ts (login/refresh/logout), bootstrap-admin.use-case.ts
    api-keys/manage-api-keys.use-case.ts (create/list/revoke)
    categories/manage-category.use-case.ts
    series/list-series.use-case.ts, upsert-series.use-case.ts
  infrastructure/               # the only layer allowed to know Prisma/NATS/HTTP
    persistence/prisma/{prisma.module.ts, prisma.service.ts}
    persistence/repositories/   # one per aggregate, implements the domain ports
    messaging/nats-client.module.ts, nats.tokens.ts,
              publishers/nats-event.publisher.ts,
              subscribers/media-downloaded.subscriber.ts, transcode-events.subscriber.ts
    http/controllers/           # health, auth, media, series, genres, categories, torrents,
                                 # api-keys, internal (one file each)
    http/guards/jwt-auth.guard.ts, read-access.guard.ts, internal-key.guard.ts,
              roles.guard.ts, auth-context.ts
    http/dto/                   # class-validator request DTOs
  config/configuration.ts       # fail-fast env var validation
  app.module.ts                 # wiring: Pino logger, JWT module, Prisma, NATS, all controllers/use-cases
  main.ts                       # bootstrap: helmet, global prefix, ValidationPipe, Swagger
prisma/schema.prisma             # see docs/data-model.md
```

## Bootstrap (`main.ts`)

- `loadConfig()` runs *before* Nest wires any providers — missing required env vars crash the
  process immediately with a clear message, rather than failing confusingly later at first use.
- `helmet()` middleware for standard security headers.
- Global prefix `api/v1`, with two explicit exclusions: `GET /health` and everything under
  `/internal/*` — both are reached at their bare path, not `/api/v1/health` or `/api/v1/internal/...`.
- `ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false })` — unknown
  body fields are silently stripped (not rejected), declared fields are coerced to their DTO types.
- Swagger served at `/docs`, with both a Bearer scheme and an `x-api-key` API-key scheme registered.

## Auth: three independent mechanisms

| mechanism | guard | header | used for |
|---|---|---|---|
| JWT (session) | `JwtAuthGuard` | `Authorization: Bearer <token>` | write endpoints, always admin-only in practice (paired with `AdminRolesGuard`) |
| API key (machine) | `ReadAccessGuard` | `Authorization: Bearer <token>` **or** `X-Api-Key: hsk_...` | public read-only endpoints (`GET /media`, `/series`, `/genres`, `/categories`) |
| Internal (service-to-service) | `InternalKeyGuard` | `X-Internal-Api-Key: <INTERNAL_API_KEY>` | `/internal/*` only, called by torrent-worker/transcode-worker/metadata-service |

**JWT** (`authenticate-user.use-case.ts`): access token is signed with `JWT_ACCESS_SECRET`, 15
minute expiry (`ACCESS_TOKEN_TTL = '15m'`), payload `{ sub: userId, email, role }`. The refresh
token is *not* a JWT — it's 48 random bytes (`randomBytes(48).toString('hex')`), stored server-side
as a sha256 hash in `RefreshToken` with a 30-day expiry, and **rotated on every use** (`RefreshTokenUseCase`
revokes the old one and issues a new pair) — this is what makes revocation possible; a pure
stateless-JWT refresh token can't be invalidated before it expires.

**API keys** (`manage-api-keys.use-case.ts`): `CreateApiKeyUseCase` generates 32 random bytes, hex-
encodes them, and returns the plaintext key as `hsk_<64 hex chars>` — **shown to the caller exactly
once at creation**; only its sha256 hash and an 8-character prefix (for fast DB lookup without
scanning) are stored. `ReadAccessGuard` tries JWT first (cheap, no DB hit) and falls back to the API
key header, hashing the provided key and comparing against the stored hash, checking `revokedAt`
and `expiresAt`. **`scopes` are stored but not enforced** — see `docs/data-model.md`'s note on
`ApiKey`.

**Internal key** (`internal-key.guard.ts`): a single static secret from `INTERNAL_API_KEY`, compared
directly — no hashing, no DB lookup, no per-caller identity. Deliberately simple: these routes are
never exposed to a host port, so the only thing this guard defends against is another container on
the same compose network without the shared secret.

**Admin bootstrap** (`bootstrap-admin.use-case.ts`, runs via Nest's `OnApplicationBootstrap`): on
every startup, if no user exists with `ADMIN_EMAIL`, create one (argon2-hashed
`ADMIN_INITIAL_PASSWORD`, role `admin`). Idempotent — safe on every restart. There is no public
registration endpoint; all other users would need to be created by an admin (not currently exposed
as an endpoint — only the bootstrap path creates users today).

## REST routes

`/api/v1` prefix implied unless noted. Guards listed in the order Nest applies them.

| method | path | guard(s) | notes |
|---|---|---|---|
| GET | `/health` | *(none — prefix-excluded)* | compose healthcheck target |
| POST | `/auth/login` | — | `{ email, password }` → `{ user, accessToken, refreshToken }` |
| POST | `/auth/refresh` | — | `{ refreshToken }` → new pair (old one revoked) |
| POST | `/auth/logout` | — | `{ refreshToken }` → revokes it |
| GET | `/media` | `ReadAccessGuard` | filters: `type`, `status`, `genreId`, `categoryId`, `seriesId`; paginated (`page`, `pageSize`, default 1/25) |
| GET | `/media/:id` | `ReadAccessGuard` | |
| PATCH | `/media/:id` | `JwtAuthGuard`, `AdminRolesGuard` | currently only `title` is editable |
| DELETE | `/media/:id` | `JwtAuthGuard`, `AdminRolesGuard` | |
| GET | `/series` | `ReadAccessGuard` | |
| GET | `/series/:id` | `ReadAccessGuard` | |
| GET | `/genres` | `ReadAccessGuard` | |
| GET | `/categories` | `ReadAccessGuard` | |
| POST | `/categories` | `JwtAuthGuard`, `AdminRolesGuard` | `{ name }` |
| PUT | `/categories/:id` | `JwtAuthGuard`, `AdminRolesGuard` | `{ name }` |
| DELETE | `/categories/:id` | `JwtAuthGuard`, `AdminRolesGuard` | |
| POST | `/torrents` | `JwtAuthGuard`, `AdminRolesGuard` | multipart: field `file` (the `.torrent`) + form field `contentType` (`movie`\|`tv`\|`music`, defaults to `movie`) |
| GET | `/torrents` | `JwtAuthGuard`, `AdminRolesGuard` | |
| GET | `/torrents/:id` | `JwtAuthGuard`, `AdminRolesGuard` | |
| POST | `/api-keys` | `JwtAuthGuard`, `AdminRolesGuard` | `{ name, scopes? }` → includes plaintext key **once** |
| GET | `/api-keys` | `JwtAuthGuard`, `AdminRolesGuard` | own keys only |
| DELETE | `/api-keys/:id` | `JwtAuthGuard`, `AdminRolesGuard` | revokes, doesn't hard-delete |
| GET | `/internal/media-items/:id` | `InternalKeyGuard` | *(no `/api/v1` prefix)* |
| POST | `/internal/media-items/:id/metadata` | `InternalKeyGuard` | *(no `/api/v1` prefix)* — see `docs/events.md` |
| POST | `/internal/series/upsert` | `InternalKeyGuard` | *(no `/api/v1` prefix)* — see `docs/events.md` |

## Logging

Pino via `nestjs-pino` (`LoggerModule.forRoot` in `app.module.ts`), JSON to stdout, `base: {
service: 'core-api' }` on every line — this `service` label is what the Loki Docker logging driver
groups by (see `docs/operations.md`). Two things worth knowing:

- **`redact` config** strips `req.headers.authorization`, `req.headers.cookie`,
  `req.headers["x-api-key"]`, `req.headers["x-internal-api-key"]`, and `res.headers["set-cookie"]`
  before a log line is ever written. This exists because these logs ship to Loki, which anyone with
  Grafana access can query — without this, a live bearer token or API key would sit in plaintext in
  a shared log store indefinitely.
- **Domain-id correlation**: business-logic use-cases that originate a new domain id log it
  explicitly (e.g. `SubmitTorrentUseCase` logs `{ torrentId, requestId, category, contentType }`),
  and the NATS subscribers log `mediaItemId`/`transcodeJobId`/`torrentHash` on every event they
  process. This is what lets you query Grafana/Loki for one id and see that item's entire journey
  across all four services — see `docs/operations.md`.
