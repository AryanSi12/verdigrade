package com.acme.orders.repo;

import com.acme.orders.model.Order;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.stereotype.Repository;

/** In-memory store; good enough for a demo desk and keeps the sample free of a database. */
@Repository
public class OrderRepository {

    private final Map<Long, Order> orders = new ConcurrentHashMap<Long, Order>();
    private final AtomicLong sequence = new AtomicLong(1000);

    /** Returns null when there is no such order. */
    public Order findById(Long id) {
        if (id == null) {
            return null;
        }
        return orders.get(id);
    }

    /** Returns null when no order has that number. */
    public Order findByNumber(String number) {
        for (Order order : orders.values()) {
            if (order.getNumber() != null && order.getNumber().equalsIgnoreCase(number)) {
                return order;
            }
        }
        return null;
    }

    public List<Order> findAll() {
        List<Order> all = new ArrayList<Order>(orders.values());
        Collections.sort(all, new Comparator<Order>() {
            @Override
            public int compare(Order a, Order b) {
                return b.getCreatedAt().compareTo(a.getCreatedAt());
            }
        });
        return all;
    }

    public Order save(Order order) {
        if (order.getId() == null) {
            order.setId(new Long(sequence.incrementAndGet()));
        }
        orders.put(order.getId(), order);
        return order;
    }

    public boolean delete(Long id) {
        return orders.remove(id) != null;
    }

    public int count() {
        return orders.size();
    }

    public void clear() {
        orders.clear();
    }
}
