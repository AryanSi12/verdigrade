package com.acme.orders.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.acme.orders.model.CustomerTier;
import com.acme.orders.model.LineItem;
import com.acme.orders.model.Order;
import com.acme.orders.model.OrderStatus;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Arrays;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

/** How an order looks on the wire (checked through the JSON, so it holds whatever the DTO classes look like). */
@SpringBootTest
@AutoConfigureMockMvc
class OrderMapperTest {

    @Autowired
    private OrderMapper mapper;

    @Autowired
    private MockMvc mvc;

    private static Order paidOrder() {
        Order order = new Order();
        order.setId(7L);
        order.setNumber("OD-2026-7");
        order.setCustomer("Test Co");
        order.setEmail("t@test.example");
        order.setTier(CustomerTier.SILVER);
        order.setStatus(OrderStatus.PAID);
        order.setItems(Arrays.asList(new LineItem("A-1", "Widget", 3, new BigDecimal("2.00")), new LineItem("B-2", "Gadget", 1, new BigDecimal("5.00"))));
        order.setSubtotal(new BigDecimal("11.00"));
        order.setDiscount(new BigDecimal("0.55"));
        order.setTotal(new BigDecimal("10.45"));
        order.setCreatedAt(LocalDateTime.of(2026, 3, 4, 5, 6));
        return order;
    }

    @Test
    void mapsNothingToNothing() {
        assertNull(mapper.toResponse(null));
    }

    @Test
    void labelsEveryStatus() {
        assertEquals("New", mapper.statusLabel(OrderStatus.NEW));
        assertEquals("Paid", mapper.statusLabel(OrderStatus.PAID));
        assertEquals("Shipped", mapper.statusLabel(OrderStatus.SHIPPED));
        assertEquals("Delivered", mapper.statusLabel(OrderStatus.DELIVERED));
        assertEquals("Cancelled", mapper.statusLabel(OrderStatus.CANCELLED));
    }

    @Test
    void mapsEveryOrderInAList() {
        assertEquals(2, mapper.toResponses(Arrays.asList(paidOrder(), paidOrder())).size());
    }

    @Test
    void seededOrderJsonHasEveryFieldThePageReads() throws Exception {
        mvc.perform(get("/api/orders"))
            .andExpect(jsonPath("$[0].id").isNumber())
            .andExpect(jsonPath("$[0].number").isString())
            .andExpect(jsonPath("$[0].customer").isString())
            .andExpect(jsonPath("$[0].email").isString())
            .andExpect(jsonPath("$[0].tier").isString())
            .andExpect(jsonPath("$[0].status").isString())
            .andExpect(jsonPath("$[0].itemCount").isNumber())
            .andExpect(jsonPath("$[0].total").isNumber())
            .andExpect(jsonPath("$[0].createdAt").isString())
            .andExpect(jsonPath("$[0].items[0].lineTotal").isNumber())
            .andExpect(jsonPath("$[0].nextStatuses").isArray());
    }
}
