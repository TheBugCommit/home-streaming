from dataclasses import dataclass
from pathlib import Path

import mutagen

from app.parsing.filename_parser import parse_video_filename


@dataclass
class ParsedAudio:
    title: str | None
    artist: str | None
    album: str | None
    track_number: int | None
    disc_number: int | None
    source: str  # "tags" | "tags+filename" | "filename"


def _first(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, list):
        return str(value[0]) if value else None
    return str(value)


def _parse_track_number(raw: str | None) -> int | None:
    if not raw:
        return None
    # Mutagen often returns "3/12" (track/total).
    head = raw.split("/")[0].strip()
    return int(head) if head.isdigit() else None


def parse_audio_file(path: str) -> ParsedAudio:
    """Reads ID3/FLAC/etc. tags via mutagen as the primary source of music metadata. Falls back to
    filename parsing only when tags are missing or too sparse to be useful."""
    title = artist = album = None
    track_number: int | None = None
    disc_number: int | None = None

    try:
        audio = mutagen.File(path, easy=True)
    except Exception:
        audio = None

    if audio is not None and audio.tags:
        tags = audio.tags
        title = _first(tags.get("title"))
        artist = _first(tags.get("artist"))
        album = _first(tags.get("album"))
        track_number = _parse_track_number(_first(tags.get("tracknumber")))
        disc_number = _parse_track_number(_first(tags.get("discnumber")))

    has_sufficient_tags = bool(title and artist)

    if has_sufficient_tags:
        return ParsedAudio(
            title=title,
            artist=artist,
            album=album,
            track_number=track_number,
            disc_number=disc_number,
            source="tags",
        )

    guess = parse_video_filename(Path(path).name)
    return ParsedAudio(
        title=title or guess.title,
        artist=artist,
        album=album,
        track_number=track_number,
        disc_number=disc_number,
        source="tags+filename" if title or artist else "filename",
    )
