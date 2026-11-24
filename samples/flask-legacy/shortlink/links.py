import datetime

from flask import Blueprint, jsonify, redirect, request

from shortlink import slugs, stats
from shortlink.db import get_db

bp = Blueprint("links", __name__)


def _row(row):
    return {
        "id": row["id"],
        "slug": row["slug"],
        "target": row["target"],
        "created_at": datetime.datetime.fromisoformat(row["created_at"]),
        "clicks": row["clicks"],
    }


@bp.route("/links", methods=["POST"])
def create_link():
    body = request.get_json(silent=True) or {}
    try:
        target = slugs.normalize_url(body.get("url", ""))
    except ValueError as error:
        return jsonify(error=str(error)), 400
    slug = slugs.slugify(body["slug"]) if body.get("slug") else slugs.random_slug()
    db = get_db()
    if db.execute("SELECT 1 FROM links WHERE slug = ?", (slug,)).fetchone():
        return jsonify(error="slug already taken"), 409
    now = datetime.datetime.utcnow().isoformat(timespec="seconds")
    cursor = db.execute("INSERT INTO links (slug, target, created_at) VALUES (?, ?, ?)", (slug, target, now))
    db.commit()
    row = db.execute("SELECT * FROM links WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return jsonify(_row(row)), 201


@bp.route("/links", methods=["GET"])
def list_links():
    rows = [_row(row) for row in get_db().execute("SELECT * FROM links ORDER BY id").fetchall()]
    return jsonify(links=rows, summary=stats.summarize(rows))


@bp.route("/links/top", methods=["GET"])
def top():
    rows = [_row(row) for row in get_db().execute("SELECT * FROM links").fetchall()]
    return jsonify(stats.top_links(rows))


@bp.route("/l/<slug>", methods=["GET"])
def follow(slug):
    db = get_db()
    row = db.execute("SELECT * FROM links WHERE slug = ?", (slug,)).fetchone()
    if row is None:
        return jsonify(error="no such link"), 404
    db.execute("UPDATE links SET clicks = clicks + 1 WHERE id = ?", (row["id"],))
    db.commit()
    return redirect(row["target"], code=302)


@bp.route("/links/<slug>", methods=["DELETE"])
def delete_link(slug):
    db = get_db()
    cursor = db.execute("DELETE FROM links WHERE slug = ?", (slug,))
    db.commit()
    if cursor.rowcount == 0:
        return jsonify(error="no such link"), 404
    return "", 204
