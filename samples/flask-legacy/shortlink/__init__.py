import os

from flask import Flask

from shortlink import db
from shortlink.encoders import LegacyEncoder
from shortlink.links import bp as links_bp
from shortlink.health import bp as health_bp
from shortlink.reqctx import install_request_id


def create_app(test_config=None):
    app = Flask(__name__)
    app.config["DATABASE"] = os.environ.get("SHORTLINK_DB", ":memory:")
    app.config["BASE_URL"] = "http://localhost:5000"
    if test_config:
        app.config.update(test_config)

    # Old Flask way to teach jsonify about our own types.
    app.json_encoder = LegacyEncoder

    db.init_app(app)
    install_request_id(app)
    app.register_blueprint(links_bp)
    app.register_blueprint(health_bp)

    @app.before_first_request
    def create_schema():
        # Runs once, on the first request the process serves.
        with app.app_context():
            db.init_schema()

    return app
