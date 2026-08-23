from rapidfuzz import fuzz


def title_confidence(query_title: str, candidate_title: str, year_match: bool | None = None) -> float:
    """Fuzzy title similarity in [0, 1], nudged by a year match/mismatch when known.

    Kept intentionally simple (single ratio, no ML) — the point is to have *some* persisted
    confidence score so low-confidence matches can be flagged for manual review later, not to
    build a full recommender.
    """
    if not query_title or not candidate_title:
        return 0.0

    score = fuzz.token_sort_ratio(query_title.lower(), candidate_title.lower()) / 100.0

    if year_match is True:
        score = min(1.0, score + 0.05)
    elif year_match is False:
        score = max(0.0, score - 0.15)

    return round(score, 4)
