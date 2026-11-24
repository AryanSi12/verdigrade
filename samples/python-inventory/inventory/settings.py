"""Reads optional INI settings (configparser, Python 3.1 style)."""
import configparser
import io

DEFAULTS = """
[inventory]
low_stock = 3
currency = EUR
"""


def load_settings(text=None):
    parser = configparser.SafeConfigParser()
    parser.readfp(io.StringIO(DEFAULTS))
    if text:
        parser.read_string(text)
    section = parser["inventory"]
    return {"low_stock": section.getint("low_stock"), "currency": section.get("currency")}
