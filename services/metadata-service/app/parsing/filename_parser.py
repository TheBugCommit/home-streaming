from dataclasses import dataclass
from pathlib import Path
from typing import Any

from guessit import guessit


@dataclass
class ParsedVideo:
    title: str | None
    year: int | None
    season_number: int | None
    episode_number: int | None
    is_episode: bool


def parse_video_filename(path: str) -> ParsedVideo:
    """guessit natively extracts series title/season/episode for TV releases, or title/year for
    movies, from the raw release filename — this is the single place filename parsing happens;
    it is not duplicated in core-api."""
    guess: dict[str, Any] = guessit(Path(path).name)

    season = guess.get("season")
    episode = guess.get("episode")
    is_episode = season is not None and episode is not None

    return ParsedVideo(
        title=guess.get("title"),
        year=guess.get("year"),
        season_number=season if isinstance(season, int) else None,
        episode_number=episode if isinstance(episode, int) else None,
        is_episode=is_episode,
    )
