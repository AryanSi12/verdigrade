# Python / Django / Flask migration notes

Routes, tool pins and package pins live in `profiles/matrices/python.json` (validated with zod at startup; `npx verdigrade validate`). Do not copy pins into prompts or code.

The Python adapter runs: `pyupgrade --py3XX-plus` (always) and `django-upgrade --target-version <django>` (when Django is older than the route's line) from an isolated tools venv, on unlocked `.py` files only; then rules: dependency pins in `requirements*.txt` / `pyproject.toml` / `setup.py` / `setup.cfg`, `requires-python` / `python_requires`, `.python-version` and `runtime.txt`, and source rules for removed standard-library and Flask names. It then creates a fresh venv outside the project, runs `pip install`, the tests (pytest, `manage.py test` or `unittest discover`) and `python -m compileall`.

## Python 3.12 / 3.13 / 3.14 removals

- 3.12: `distutils` (use setuptools or `sysconfig`/`shutil`), `imp` (use `importlib`; `imp.reload` → `importlib.reload`, `imp.load_source` → `importlib.util.spec_from_file_location`), `asynchat`/`asyncore` (use `asyncio`), `smtpd`; unittest aliases `assertEquals`, `assertNotEquals`, `assertRegexpMatches`, `assertRaisesRegexp`, `failUnless`… (use the modern names); `configparser.SafeConfigParser` → `ConfigParser`, `readfp` → `read_file`; `ssl.wrap_socket` → `SSLContext.wrap_socket`; `ssl.match_hostname` removed.
- 3.13 (PEP 594): `aifc`, `audioop`, `cgi`, `cgitb`, `chunk`, `crypt`, `imghdr`, `mailcap`, `msilib`, `nis`, `nntplib`, `ossaudiodev`, `pipes`, `sndhdr`, `spwd`, `sunau`, `telnetlib`, `uu`, `xdrlib`; also `lib2to3`, `tkinter.tix`, `locale.resetlocale`, `typing.io`/`typing.re`, `unittest.makeSuite`/`findTestCases`/`getTestCaseNames`. `cgi.parse_header` → `email.message.Message`; `pipes.quote` → `shlex.quote`; `crypt` → `hashlib`/passlib.
- 3.14: `ast.Num`/`Str`/`Bytes`/`NameConstant`/`Ellipsis` (use `ast.Constant`), `pkgutil.find_loader`/`get_loader` (use `importlib.util.find_spec`), `urllib.request.URLopener`/`FancyURLopener`. Old pytest releases (7.0, for example) crash on 3.14 because they still use `ast.Str`: raise pytest rather than patching it.
- Deprecated (warning, not an error): `datetime.utcnow()` / `utcfromtimestamp()` → `datetime.now(datetime.UTC)` (the value becomes timezone-aware; check comparisons).

## Flask 3 / Werkzeug 3

- Removed in Flask 2.3: `@app.before_first_request` (do the work in the app factory or `with app.app_context()`), `app.json_encoder`/`json_decoder` (subclass `flask.json.provider.DefaultJSONProvider`), `JSON_AS_ASCII`/`JSON_SORT_KEYS`/`JSONIFY_MIMETYPE`/`JSONIFY_PRETTYPRINT_REGULAR` (set `app.json.ensure_ascii`, `.sort_keys`, `.mimetype`, `.compact`). The old config keys are silently ignored.
- Removed in Flask 3.0: `flask.Markup` and `flask.escape` (import from `markupsafe`). `flask.__version__` is deprecated (use `importlib.metadata.version("flask")`).
- Werkzeug 3 removed `werkzeug.urls.url_quote`, `url_unquote`, `url_encode`, `url_parse`… (use `urllib.parse`).

## Django

- django-upgrade fixes most removals (`force_text` → `force_str`, `ugettext*` → `gettext*`, `url()` → `re_path()`, `django.conf.urls.include`…). What it cannot fix shows as review items.
- Django 5.0 makes `USE_TZ = True` the default; set it explicitly to keep behaviour. Set `DEFAULT_AUTO_FIELD` to avoid models.W042 and unplanned primary-key migrations.
- Django 5.2 LTS supports Python 3.10–3.14; Django 6.1 is the first line with Python 3.15.

## Fix-up rules

- Prefer source edits over pinning old versions. Never downgrade a package the route bumped and never lower `requires-python`.
- A package with no wheel for the new Python (pip tries to compile and fails): raise its pin to a release that ships wheels for the target.
- Never add `-W ignore` or `filterwarnings` to hide a failure, and never delete or skip a test.
- Do not create or edit anything under `.venv/`, `venv/`, `__pycache__/` or `site-packages/` (the tools refuse it).
