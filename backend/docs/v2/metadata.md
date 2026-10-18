# Metadades: TMDb + Jellyfin

Aquest document explica el model híbrid i respon directament la pregunta: **podem agafar les
metadades directament de Jellyfin?**

## Resposta curta

**Sí, però no per a tot.** Jellyfin és perfecte com a **font de la fitxa enriquida** (sinopsi,
imatges, repartiment, gèneres) un cop el fitxer és a la llibreria. Però Jellyfin **no ofereix cap API
per «buscar a proveïdors»** abans de tenir el fitxer: l'enriquiment el fan els seus plugins interns
(TMDb/TVDB) *després* d'escanejar la llibreria, i depèn del **nom de la carpeta/fitxer** per fer el
matching. Per tant:

- Si el fitxer arriba amb un nom de torrent brut, Jellyfin sovint **no l'identifica** correctament.
- Però Jellyfin **sí** que pot fer tota l'enriquiment si prèviament l'hem anomenat bé.

La conclusió és el model **híbrid**: TMDb per *identificar i anomenar*, Jellyfin per *enriquir i
servir la fitxa*.

## Com funciona l'API de Jellyfin

Autenticació: capçalera `Authorization: MediaBrowser Token="<API_KEY>"` (o `?api_key=<API_KEY>`).

- **Refresc de llibreria** — `POST /Library/Refresh` (totes) o `POST /Items/{id}/Refresh`.
- **Cercar l'ítem indexat** — `GET /Items?Recursive=true&SearchTerm=<títol>&IncludeItemTypes=Movie,Series&Fields=ProviderIds,Overview,Genres,People,MediaSources`.
- **Detall d'un ítem** — `GET /Items/{id}?Fields=Overview,Genres,People,ProviderIds,MediaSources,DateCreated`.
- **Imatge** — `GET /Items/{id}/Images/Primary?maxWidth=...` (es pot servir directament al frontend,
  o bé desar l'URL i deixar que el navegador la carregui de Jellyfin).

Jellyfin **no** té un endpoint tipus `GET /Search?title=...` contra TMDb per obtenir candidats; això
només ho fan els plugins durant l'escaneig.

## El repartiment de responsabilitats

### 1. TMDb — identificació (Go)

- Cerca per títol/any parsejat del nom del torrent o del fitxer.
- Per a sèries, parseja `SxxEyy` i busca la sèrie; resol episodi concret.
- Puntuació de confiança (any, títol, popularitat). Es desa a `metadata_lookups`.
- Resultat: `tmdb_id`, títol canònic, any → decideix el **nom i destí final** a `library/`.

Si la confiança és baixa, el `media_item` queda en estat que demana **revisió manual** a la UI (l'admin
pot corregir títol/any i reintentar la publicació).

### 2. Jellyfin — enriquiment (read-back)

- Després de `publish`, es refresca la llibreria.
- Quan Jellyfin ha indexat l'ítem, es llegeix per `jellyfin_item_id` i s'hi prenen els camps rics.
- El catàleg pot **desar** aquests camps o **referenciar-los**; a la pràctica es desen els essencials
  (overview, gèneres, rutes d'imatge) i es deixa Jellyfin com a font de veritat per a la resta.

Així no dupliquem l'stack de metadades: TMDb fa la feina que Jellyfin no pot fer (identificar abans
d'indexar) i Jellyfin fa la que ja fa bé (enriquir).

## Per què no només Jellyfin

Posar el fitxer amb el nom del torrent i esperar que Jellyfin el resolgui funciona de vegades, però
els noms de release (`Some.Movie.2019.1080p.BluRay.x264-GROUP.mkv`) fan que el matching falli o
ambiguï. Com que igualment cal **renombrar abans de publicar** per garantir la indexació, aprofitem
aquell pas per fer la consulta a TMDb i tenir control sobre el resultat.

## Per què no TMDb per a tot

Jellyfin ja descarrega imatges i repartiment i els manté actualitzats amb els seus plugins. Replicar
això a Go seria duplicar feina i perdre el repartiment/artwork que Jellyfin gestiona millor.

## Confiança i revisió manual

`metadata_lookups.confidence_score` permet:

- Publicar automàticament per sobre d'un llindar.
- Marcar per a revisió manual per sota (la UI mostra els candidats i permet triar-ne un).

Es conserven **tots** els resultats de cerca (encara que siguin dolents) perquè la revisió manual
tingui context.
