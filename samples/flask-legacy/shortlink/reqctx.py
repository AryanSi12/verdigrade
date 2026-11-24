import uuid

from flask import _request_ctx_stack


def install_request_id(app):
    @app.before_request
    def stamp():
        ctx = _request_ctx_stack.top
        ctx.request_id = ctx.request.headers.get("X-Request-Id") or uuid.uuid4().hex

    @app.after_request
    def echo(response):
        ctx = _request_ctx_stack.top
        if ctx is not None:
            response.headers["X-Request-Id"] = getattr(ctx, "request_id", "-")
        return response


def current_request_id():
    ctx = _request_ctx_stack.top
    return getattr(ctx, "request_id", None) if ctx else None
