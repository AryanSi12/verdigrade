# python-inventory

Small stock API on **Python 3.8 and Flask 2.0**, intentionally behind, for the Python adapter.

| Exercises | Where |
| --- | --- |
| pyupgrade `--py314-plus` (`typing.List`, `super(Item, self)`, `u""`, `.format()`, `class X(object)`) | `inventory/stock.py`, `inventory/__init__.py`, `tests/` |
| Flask 3 removals: `from flask import Markup, escape`, `JSON_SORT_KEYS` config | `inventory/app.py` |
| Python 3.12 removals: `imp`, `SafeConfigParser`/`readfp`, unittest `assertEquals`/`assertRaisesRegexp` | `inventory/plugins.py`, `inventory/settings.py`, `tests/test_inventory.py` |
| Deprecated, flagged for review: `datetime.utcnow()`, `flask.__version__` | `inventory/stock.py`, `inventory/app.py` |
| Pin bumps (Flask, Werkzeug, Jinja2, click, pytest 7.0 → 9) and `requires-python` | `requirements*.txt`, `pyproject.toml` |
| `.python-version`, `runtime.txt` | project root |
| Manual follow-ups (Dockerfile `python:3.8-slim`, CI Python 3.8) | `Dockerfile`, `.github/` |

`pytest` runs 9 tests. They pass on Python 3.8 with the old pins and, after the migration, on Python 3.14 with the new ones.
pytest 7.0 itself crashes on Python 3.14, so the pin bump is part of the upgrade, not cosmetic.

```bash
cd ../../agent
npx leapfrog plan ../samples/python-inventory --approve
npx leapfrog migrate ../samples/python-inventory --dry-run
```

Needs a Python 3.14 interpreter (`python3.14` on PATH, `py -3.14` on Windows, or `LEAPFROG_PYTHON`) and network
access for pip. Lock `inventory/app.py` in the plan to see a predicted (and real) failure at the Test step.

Delete the generated `migration-plan.json` afterwards if you do not want to keep it.
