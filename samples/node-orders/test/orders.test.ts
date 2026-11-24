import { strict as assert } from "node:assert";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { createApp } from "../src/app";
import { linkPath } from "../src/links";
import { OrderService } from "../src/orders";

describe("OrderService", () => {
  it("creates and cancels an order", () => {
    const service = new OrderService();
    const order = service.create("Ada", ["book"]);
    assert.equal(order.status, "open");
    assert.equal(service.cancel(order.id), true);
    assert.equal(service.cancel(order.id), false);
  });

  it("rejects an order without items", () => {
    assert.throws(() => new OrderService().create("Ada", []), /at least one item/);
  });
});

describe("links", () => {
  it("keeps only the path of a link", () => {
    assert.equal(linkPath("http://shop.local/orders?page=2"), "/orders");
  });
});

describe("HTTP API", () => {
  let base = "";
  let close: () => void = () => {};

  before(async () => {
    const server = createApp().listen(0);
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => server.close();
  });

  after(() => close());

  it("creates, reads and cancels an order", async () => {
    const created = await fetch(`${base}/orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ customer: "Grace", items: ["lamp"] }),
    });
    assert.equal(created.status, 201);
    const order = (await created.json()) as { id: string };

    const read = await fetch(`${base}/orders/${order.id}`);
    assert.equal(read.status, 200);

    const cancelled = await fetch(`${base}/orders/${order.id}`, { method: "DELETE" });
    assert.equal(cancelled.status, 204);
    const again = await fetch(`${base}/orders/${order.id}`, { method: "DELETE" });
    assert.equal(again.status, 409);
  });

  it("returns 404 and 400 for bad requests", async () => {
    assert.equal((await fetch(`${base}/orders/999`)).status, 404);
    const bad = await fetch(`${base}/orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ customer: "", items: [] }),
    });
    assert.equal(bad.status, 400);
  });

  it("lists orders", async () => {
    const response = await fetch(`${base}/orders`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { orders: unknown[] };
    assert.ok(Array.isArray(body.orders));
  });

  it("redirects an acknowledgement back to the referrer", async () => {
    const response = await fetch(`${base}/orders/1/ack`, { method: "POST", redirect: "manual", headers: { referer: "/orders" } });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/orders");
  });
});
