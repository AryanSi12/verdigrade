import express from "express";
import { OrderService } from "./orders";

/** Express 4 app that still uses APIs removed in Express 5. */
export function createApp(service = new OrderService()) {
  const app = express();
  app.use(express.json());

  app.get("/orders", (req, res) => {
    res.json({ orders: service.list() });
  });

  app.get("/orders/:id", (req, res) => {
    const order = service.get(req.param("id"));
    if (!order) return res.send(404);
    res.json(order);
  });

  app.post("/orders", (req, res) => {
    try {
      const order = service.create(String(req.body.customer ?? ""), Array.isArray(req.body.items) ? req.body.items : []);
      res.status(201).json(order);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.delete("/orders/:id", (req, res) => {
    if (!service.cancel(req.param("id"))) return res.send(409);
    res.send(204);
  });

  // Sends the caller back where it came from.
  app.post("/orders/:id/ack", (req, res) => {
    res.redirect("back");
  });

  return app;
}
