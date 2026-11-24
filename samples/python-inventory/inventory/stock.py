# -*- coding: utf-8 -*-
"""Stock records: plain Python, written in the Python 3.6 style."""
from __future__ import unicode_literals

from datetime import datetime
from typing import Dict, List, Optional


class StockError(Exception):
    pass


class Item(object):
    def __init__(self, sku, name, quantity=0):
        # type: (str, str, int) -> None
        super(Item, self).__init__()
        self.sku = sku
        self.name = name
        self.quantity = quantity
        self.updated = datetime.utcnow()

    def label(self):
        return u"{} ({} in stock)".format(self.name, self.quantity)

    def as_dict(self) -> Dict[str, object]:
        return {"sku": self.sku, "name": self.name, "quantity": self.quantity}


class Stock(object):
    def __init__(self):
        self._items = {}  # type: Dict[str, Item]

    def add(self, sku: str, name: str, quantity: int = 0) -> Item:
        if sku in self._items:
            raise StockError("SKU %s already exists" % sku)
        item = Item(sku, name, quantity)
        self._items[sku] = item
        return item

    def get(self, sku: str) -> Optional[Item]:
        return self._items.get(sku)

    def adjust(self, sku: str, delta: int) -> Item:
        item = self._items.get(sku)
        if item is None:
            raise StockError("Unknown SKU %s" % sku)
        if item.quantity + delta < 0:
            raise StockError("Not enough {} in stock".format(item.name))
        item.quantity += delta
        item.updated = datetime.utcnow()
        return item

    def all(self) -> List[Item]:
        return sorted(self._items.values(), key=lambda item: item.sku)
