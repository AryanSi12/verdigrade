package com.acme.orders.service;

import com.acme.orders.dto.LineItemRequest;
import com.acme.orders.dto.OrderRequest;
import com.acme.orders.model.Order;
import com.acme.orders.model.OrderStatus;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

/** A few believable orders so the dashboard is not empty on first start. */
@Component
public class SeedData implements CommandLineRunner {

    @Autowired
    private OrderService orders;

    @Override
    public void run(String... args) {
        seed("Northwind Traders", "buyers@northwind.example", "GOLD", OrderStatus.DELIVERED,
            line("KB-201", "Mechanical keyboard", 4, "89.00"), line("MS-110", "Wireless mouse", 4, "24.50"));
        seed("Blue Harbor Cafe", "ops@blueharbor.example", "SILVER", OrderStatus.SHIPPED,
            line("GR-450", "Burr coffee grinder", 1, "149.00"), line("FL-020", "Paper filters (200)", 6, "6.75"));
        seed("Maple & Co", "hello@maple.example", "STANDARD", OrderStatus.PAID,
            line("NB-A5", "Dot-grid notebook", 12, "9.90"));
        seed("Orbit Labs", "procurement@orbit.example", "GOLD", OrderStatus.NEW,
            line("MN-27Q", "27\" monitor", 3, "279.00"), line("HB-USB", "USB-C hub", 3, "39.00"));
        seed("Greenline Bikes", "shop@greenline.example", "STANDARD", OrderStatus.CANCELLED,
            line("LT-900", "Bike light set", 2, "32.00"));
        seed("Studio Nine", "admin@studionine.example", "SILVER", OrderStatus.NEW,
            line("DL-14", "Desk lamp", 2, "54.00"), line("CB-3", "Cable organiser", 5, "8.40"));
        System.out.println("Seeded demo orders");
    }

    private void seed(String customer, String email, String tier, OrderStatus target, LineItemRequest... lines) {
        OrderRequest request = new OrderRequest();
        request.setCustomer(customer);
        request.setEmail(email);
        request.setTier(tier);
        List<LineItemRequest> items = new ArrayList<LineItemRequest>();
        for (LineItemRequest line : lines) {
            items.add(line);
        }
        request.setItems(items);
        Order order = orders.create(request);
        walkTo(order, target);
    }

    private void walkTo(Order order, OrderStatus target) {
        if (target == OrderStatus.CANCELLED) {
            orders.changeStatus(order.getId(), OrderStatus.CANCELLED);
            return;
        }
        OrderStatus[] path = {OrderStatus.PAID, OrderStatus.SHIPPED, OrderStatus.DELIVERED};
        for (OrderStatus step : path) {
            if (order.getStatus() == target) {
                return;
            }
            orders.changeStatus(order.getId(), step);
        }
    }

    private LineItemRequest line(String sku, String name, int quantity, String price) {
        LineItemRequest line = new LineItemRequest();
        line.setSku(sku);
        line.setName(name);
        line.setQuantity(quantity);
        line.setUnitPrice(new BigDecimal(price));
        return line;
    }
}
