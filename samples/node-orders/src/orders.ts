export type Order = { id: string; customer: string; items: string[]; status: "open" | "shipped" | "cancelled" };

/** In-memory order book. Kept tiny so the migration diff is easy to review. */
export class OrderService {
  private readonly orders = new Map<string, Order>();
  private next = 1;

  create(customer: string, items: string[]): Order {
    if (!customer.trim()) throw new Error("customer is required");
    if (!items.length) throw new Error("at least one item is required");
    const order: Order = { id: String(this.next++), customer: customer.trim(), items, status: "open" };
    this.orders.set(order.id, order);
    return order;
  }

  get(id: string): Order | undefined {
    return this.orders.get(id);
  }

  list(): Order[] {
    return [...this.orders.values()];
  }

  cancel(id: string): boolean {
    const order = this.orders.get(id);
    if (!order || order.status !== "open") return false;
    order.status = "cancelled";
    return true;
  }
}
