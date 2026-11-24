import flask
from flask import Flask, Markup, abort, escape, jsonify, request

from inventory.settings import load_settings
from inventory.stock import Stock, StockError


def create_app(settings_text=None):
    app = Flask(__name__)
    app.config["JSON_SORT_KEYS"] = False
    settings = load_settings(settings_text)
    stock = Stock()
    stock.add("A-100", "Bolts", 40)
    stock.add("A-200", "Nuts", 2)

    @app.route("/items")
    def list_items():
        return jsonify([item.as_dict() for item in stock.all()])

    @app.route("/items/<sku>")
    def get_item(sku):
        item = stock.get(sku)
        if item is None:
            abort(404)
        return jsonify(item.as_dict())

    @app.route("/items/<sku>/adjust", methods=["POST"])
    def adjust(sku):
        delta = int(request.get_json(force=True).get("delta", 0))
        try:
            item = stock.adjust(sku, delta)
        except StockError as error:
            return jsonify({"error": str(error)}), 400
        return jsonify(item.as_dict())

    @app.route("/low-stock")
    def low_stock():
        low = [item for item in stock.all() if item.quantity <= settings["low_stock"]]
        rows = "".join("<li>{}</li>".format(escape(item.label())) for item in low)
        return Markup("<ul>{}</ul>").format(Markup(rows))

    @app.route("/version")
    def version():
        return jsonify({"flask": flask.__version__, "currency": settings["currency"]})

    return app
