import datetime
import random
import ssl

import pytest

from shortlink import health, slugs, stats


def test_slugify_collapses_punctuation():
    assert slugs.slugify("  Hello, World!  ") == "hello-world"


def test_random_slug_uses_the_given_generator():
    assert slugs.random_slug(4, random.Random(7)) == slugs.random_slug(4, random.Random(7))
    assert len(slugs.random_slug(9)) == 9


def test_normalize_url_adds_a_scheme_and_keeps_the_port():
    assert slugs.normalize_url("Example.com:8080/a?b=1#top") == "http://example.com:8080/a?b=1"


def test_normalize_url_rejects_other_schemes():
    with pytest.raises(ValueError):
        slugs.normalize_url("javascript://x")


def test_age_in_days():
    now = datetime.datetime(2026, 1, 10, 12, 0, 0)
    assert stats.age_in_days("2026-01-01T12:00:00", now) == 9


def test_top_links_breaks_ties_by_slug():
    rows = [{"slug": "b", "clicks": 1}, {"slug": "a", "clicks": 1}, {"slug": "c", "clicks": 5}]
    assert [row["slug"] for row in stats.top_links(rows, 2)] == ["c", "a"]


def test_tls_probe_reports_true_when_the_handshake_works(monkeypatch):
    class Sock:
        def close(self):
            pass

    monkeypatch.setattr(health.socket, "create_connection", lambda *args, **kwargs: Sock())
    monkeypatch.setattr(ssl, "wrap_socket", lambda sock: sock, raising=False)
    assert health.tls_probe("example.org") is True


def test_tls_probe_reports_false_when_the_connection_fails(monkeypatch):
    def refuse(*args, **kwargs):
        raise OSError("refused")

    monkeypatch.setattr(health.socket, "create_connection", refuse)
    assert health.tls_probe("example.org") is False
