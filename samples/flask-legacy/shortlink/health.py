import datetime
import socket
import ssl

import flask
from flask import Blueprint, jsonify

bp = Blueprint("health", __name__)

STARTED = datetime.datetime.utcnow()


def tls_probe(host: str, port: int = 443, timeout: float = 3.0) -> bool:
    """True when the host completes a TLS handshake (used by the optional link checker)."""
    try:
        raw = socket.create_connection((host, port), timeout=timeout)
        wrapped = ssl.wrap_socket(raw)
        wrapped.close()
        return True
    except (OSError, ssl.SSLError):
        return False


@bp.route("/health")
def health():
    uptime = datetime.datetime.utcnow() - STARTED
    return jsonify(status="ok", flask=flask.__version__, uptime_seconds=int(uptime.total_seconds()))
