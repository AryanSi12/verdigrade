package com.acme.orders.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.acme.orders.model.Order;
import com.acme.orders.model.OrderStatus;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest
class OrderServiceTest {

    @Autowired
    private OrderService orders;

    @Test
    void transitionsFollowTheLifecycle() {
        assertEquals(Arrays.asList(OrderStatus.PAID, OrderStatus.CANCELLED), orders.allowedNext(OrderStatus.NEW));
        assertEquals(Arrays.asList(OrderStatus.SHIPPED, OrderStatus.CANCELLED), orders.allowedNext(OrderStatus.PAID));
        assertEquals(Collections.singletonList(OrderStatus.DELIVERED), orders.allowedNext(OrderStatus.SHIPPED));
        assertTrue(orders.allowedNext(OrderStatus.DELIVERED).isEmpty());
        assertTrue(orders.allowedNext(OrderStatus.CANCELLED).isEmpty());
    }

    @Test
    void listFiltersByStatusIgnoringCase() {
        List<Order> cancelled = orders.list("cancelled");
        assertFalse(cancelled.isEmpty());
        for (Order order : cancelled) {
            assertEquals(OrderStatus.CANCELLED, order.getStatus());
        }
        assertEquals(orders.list(null).size(), orders.list("all").size());
    }

    @Test
    void missingOrderThrows() {
        OrderNotFoundException e = assertThrows(OrderNotFoundException.class, () -> orders.get(424242L));
        assertEquals("Order 424242 was not found", e.getMessage());
    }

    @Test
    void seededOrdersHaveNumbersAndTotals() {
        for (Order order : orders.list(null)) {
            assertTrue(order.getNumber().startsWith("OD-"), order.getNumber());
            assertEquals(order.getSubtotal().subtract(order.getDiscount()), order.getTotal());
        }
    }

    @Test
    void refusesToSkipSteps() {
        Order fresh = orders.list("new").get(0);
        assertThrows(InvalidTransitionException.class, () -> orders.changeStatus(fresh.getId(), OrderStatus.SHIPPED));
    }
}
