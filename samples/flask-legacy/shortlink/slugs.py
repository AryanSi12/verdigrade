import random
import re
import string
from typing import Optional

from werkzeug.urls import url_parse, url_quote

ALPHABET = string.ascii_lowercase + string.digits


def random_slug(length: int = 6, rng: Optional[random.Random] = None) -> str:
    rng = rng or random
    return "".join(rng.choice(ALPHABET) for _ in range(length))


def slugify(text: str) -> str:
    """'Hello, World!' -> 'hello-world' (percent-quoted when it still has odd characters)."""
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return url_quote(slug)


def normalize_url(raw: str) -> str:
    """Adds http:// when missing, lower-cases the host and drops the fragment."""
    if "://" not in raw:
        raw = "http://" + raw
    parts = url_parse(raw)
    if parts.scheme not in ("http", "https") or not parts.host:
        raise ValueError("not a web address: %r" % raw)
    netloc = parts.host.lower() + (":%d" % parts.port if parts.port else "")
    return parts.replace(netloc=netloc, fragment="").to_url()
