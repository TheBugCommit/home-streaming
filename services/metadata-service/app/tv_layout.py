import re
import shutil
from pathlib import Path


def _sanitize_path_segment(value: str) -> str:
    # Strip characters that are awkward across filesystems; keep it readable, not exhaustive.
    return re.sub(r'[<>:"/\\|?*]', "", value).strip()


def build_episode_target_path(
    tv_root: str,
    series_title: str,
    series_year: int | None,
    season_number: int,
    episode_number: int,
    episode_title: str | None,
    extension: str,
) -> Path:
    """Builds the path Jellyfin expects for TV libraries:
    <root>/<Series Title> (<Year>)/Season NN/<Series Title> - SxxEyy - <Episode Title>.<ext>
    """
    series_folder = _sanitize_path_segment(series_title)
    if series_year:
        series_folder = f"{series_folder} ({series_year})"

    season_folder = f"Season {season_number:02d}"

    file_name = f"{_sanitize_path_segment(series_title)} - S{season_number:02d}E{episode_number:02d}"
    if episode_title:
        file_name = f"{file_name} - {_sanitize_path_segment(episode_title)}"
    file_name = f"{file_name}.{extension.lstrip('.')}"

    return Path(tv_root) / series_folder / season_folder / file_name


def move_episode_file(source_path: str, target_path: Path) -> Path:
    """Moves the transcoded episode into its final Jellyfin-convention location. Only called after
    the metadata write to core-api succeeds, since the DB's file_path must always point at a file
    that actually exists on disk at streamable/tv."""
    target_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(source_path, str(target_path))
    return target_path
