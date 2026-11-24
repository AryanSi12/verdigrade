import datetime
from typing import Dict, List


def age_in_days(created_at: str, now=None) -> int:
    created = datetime.datetime.fromisoformat(created_at)
    now = now or datetime.datetime.utcnow()
    return (now - created).days


def top_links(rows: List[dict], limit: int = 3) -> List[dict]:
    return sorted(rows, key=lambda row: (-row["clicks"], row["slug"]))[:limit]


def summarize(rows: List[dict]) -> Dict[str, int]:
    return {"links": len(rows), "clicks": sum(row["clicks"] for row in rows)}
