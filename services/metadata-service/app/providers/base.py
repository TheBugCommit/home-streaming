from dataclasses import dataclass, field
from typing import Any


@dataclass
class MatchResult:
    """Normalized shape returned by every provider, regardless of underlying API."""

    provider: str
    external_id: str | None
    confidence: float
    payload: dict[str, Any] = field(default_factory=dict)

    @property
    def matched(self) -> bool:
        return self.external_id is not None
