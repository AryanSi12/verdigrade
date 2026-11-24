import sqlite3

from flask import current_app, g

SCHEMA = """
CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    target TEXT NOT NULL,
    created_at TEXT NOT NULL,
    clicks INTEGER NOT NULL DEFAULT 0
);
"""

_memory = {}


def get_db():
    if "db" not in g:
        name = current_app.config["DATABASE"]
        if name == ":memory:":
            # One shared in-memory database per app so every request sees the same rows.
            conn = _memory.get(id(current_app._get_current_object()))
            if conn is None:
                conn = sqlite3.connect(":memory:", check_same_thread=False)
                _memory[id(current_app._get_current_object())] = conn
        else:
            conn = sqlite3.connect(name)
        conn.row_factory = sqlite3.Row
        g.db = conn
    return g.db


def close_db(exc=None):
    g.pop("db", None)  # file databases are opened per request; memory ones live with the app


def init_schema():
    get_db().executescript(SCHEMA)
    get_db().commit()


def init_app(app):
    app.teardown_appcontext(close_db)
