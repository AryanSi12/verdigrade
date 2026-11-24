import unittest

import pytest

from inventory import create_app
from inventory.plugins import reload_plugin
from inventory.settings import load_settings
from inventory.stock import Stock, StockError


@pytest.fixture()
def client():
    return create_app().test_client()


def test_list_items(client):
    response = client.get("/items")
    assert response.status_code == 200
    assert [item["sku"] for item in response.get_json()] == ["A-100", "A-200"]


def test_missing_item_is_404(client):
    assert client.get("/items/NOPE").status_code == 404


def test_adjust_and_reject_negative(client):
    ok = client.post("/items/A-100/adjust", json={"delta": -5})
    assert ok.get_json()["quantity"] == 35
    bad = client.post("/items/A-200/adjust", json={"delta": -10})
    assert bad.status_code == 400
    assert "Not enough Nuts" in bad.get_json()["error"]


def test_low_stock_is_escaped_html(client):
    body = client.get("/low-stock").get_data(as_text=True)
    assert body == "<ul><li>Nuts (2 in stock)</li></ul>"


def test_version_endpoint(client):
    data = client.get("/version").get_json()
    assert data["currency"] == "EUR"
    assert data["flask"]


def test_plugins_reload():
    assert callable(reload_plugin("inventory.settings").load_settings)


class StockTest(unittest.TestCase):
    def test_settings_override(self):
        self.assertEquals(load_settings("[inventory]\nlow_stock = 7\n")["low_stock"], 7)

    def test_duplicate_sku(self):
        stock = Stock()
        stock.add("X", "Thing")
        with self.assertRaisesRegexp(StockError, "already exists"):
            stock.add("X", "Thing")

    def test_label(self):
        self.assertEquals(Stock().add("Y", "Washers", 3).label(), "Washers (3 in stock)")
