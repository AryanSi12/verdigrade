# leapfrog-sample-flask-legacy

A URL-shortener API on an **old Flask**: a **Python migration sample** for [Verdigrade](https://github.com/AryanSi12) where the **Full AI** engine is the better fit, because there are no recipes for most of what breaks.

Python has no OpenRewrite. Verdigrade's codemods (`pyupgrade`, `django-upgrade`) only modernise syntax and pins. The things that
actually break going from Flask 2.2 on Python 3.8 to Flask 3.1 on Python 3.14 are removed APIs that need an edit by judgment.

| | Before (this repo) | Target of the Verdigrade route |
| --- | --- | --- |
| Python | 3.8 | 3.14 |
| Flask | 2.2.5 (Werkzeug 2.2.3) | 3.1 |
| Tests | pytest 7.2 | pytest 9 |
| Database | SQLite (standard library) | same |

## The intended AI items (14 findings in 5 files)

| File | Problem | What the fix needs |
| --- | --- | --- |
| `shortlink/__init__.py` | `@app.before_first_request` and `app.json_encoder` (removed in Flask 2.3) | Create the schema inside `create_app()` and set a custom JSON provider |
| `shortlink/encoders.py` | `flask.json.JSONEncoder` subclass | A `DefaultJSONProvider` subclass with a `default` function |
| `shortlink/reqctx.py` | `_request_ctx_stack` (removed in Flask 3.0), 4 places | `flask.g` and `request` |
| `shortlink/slugs.py` | `werkzeug.urls.url_quote` and `url_parse` (removed in Werkzeug 3) | `urllib.parse.quote` and `urlsplit`, keeping `normalize_url` behaviour |
| `shortlink/health.py` | `ssl.wrap_socket` (removed in Python 3.12) | `ssl.create_default_context().wrap_socket(..., server_hostname=host)` |

Review items the AI can also tidy: `datetime.utcnow()` in 4 files and `flask.__version__`.
One manual follow-up (the Dockerfile base image) is listed but never edited. The sample has no CI workflow on purpose.

## What migrates on its own ("Safe")

- Version pins (Flask, Werkzeug, Jinja2, itsdangerous, click, MarkupSafe, pytest)
- `requires-python`, `.python-version`, `runtime.txt`
- `pyupgrade` syntax changes (very little here: one file)

## Which engine fits

**Full AI is the better choice here.** Hybrid's first stage is only `pyupgrade` and the pin bumps, which touches almost nothing,
so Hybrid ends up making the same AI edits as Full AI. It still works, but you do not save much by running the codemods first.

Plan-screen token estimates (a range from file sizes, not a measurement, no prices):

| Engine | Input tokens | Output tokens |
| --- | --- | --- |
| Hybrid | about 600k to 1.1M | about 17k to 55k |
| Full AI | about 830k to 1.5M | about 23k to 73k |

## Size

8 modules, 21 tests (pytest). The tests pass on the old pins. They do not call the network: the TLS probe test replaces
`ssl.wrap_socket`, so the suite also runs on a newer Python.

```bash
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
pytest -q
flask --app shortlink run                              # http://localhost:5000
```

```bash
curl -s -X POST localhost:5000/links -H 'Content-Type: application/json' -d '{"url":"example.com/docs","slug":"docs"}'
curl -si localhost:5000/l/docs
```

## Try it with Verdigrade

In Verdigrade choose **GitHub repo** and paste this repository's URL, or clone it and use **New migration** on the folder.
Needs a Python 3.14 interpreter (`python3.14` on PATH, `py -3.14` on Windows, or `LEAPFROG_PYTHON`) and network access for pip.

Everything in here is synthetic sample code and carries no real data.
