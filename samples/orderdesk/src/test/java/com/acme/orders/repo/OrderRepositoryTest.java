package com.acme.orders.repo;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.acme.orders.model.Order;
import java.time.LocalDateTime;
import org.junit.jupiter.api.Test;

class OrderRepositoryTest {

    private static Order order(String customer, LocalDateTime created) {
        Order order = new Order();
        order.setCustomer(customer);
        order.setCreatedAt(created);
        return order;
    }

    @Test
    void saveAssignsIdsAndListsNewestFirst() {
        OrderRepository repository = new OrderRepository();
        Order older = repository.save(order("Older", LocalDateTime.of(2024, 1, 1, 9, 0)));
        Order newer = repository.save(order("Newer", LocalDateTime.of(2024, 2, 1, 9, 0)));
        assertNotNull(older.getId());
        assertTrue(newer.getId() > older.getId());
        assertEquals("Newer", repository.findAll().get(0).getCustomer());
        assertEquals(2, repository.count());
    }

    @Test
    void deleteRemovesOnlyExistingOrders() {
        OrderRepository repository = new OrderRepository();
        Order saved = repository.save(order("Someone", LocalDateTime.now()));
        assertTrue(repository.delete(saved.getId()));
        assertFalse(repository.delete(saved.getId()));
        assertEquals(0, repository.count());
    }
}
