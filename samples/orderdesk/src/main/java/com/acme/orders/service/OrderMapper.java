package com.acme.orders.service;

import com.acme.orders.dto.LineItemResponse;
import com.acme.orders.dto.OrderResponse;
import com.acme.orders.model.LineItem;
import com.acme.orders.model.Order;
import com.acme.orders.model.OrderStatus;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
public class OrderMapper {

    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm");

    @Autowired
    private OrderService orders;

    public OrderResponse toResponse(Order order) {
        if (order == null) {
            return null;
        }
        List<LineItemResponse> items = new ArrayList<LineItemResponse>();
        int count = 0;
        for (LineItem item : order.getItems()) {
            items.add(new LineItemResponse(item.getSku(), item.getName(), item.getQuantity(), item.getUnitPrice(), item.lineTotal()));
            count += item.getQuantity();
        }
        List<String> next = orders.allowedNext(order.getStatus()).stream().map(OrderStatus::name).collect(Collectors.toList());
        String created = order.getCreatedAt() != null ? order.getCreatedAt().format(TIME) : null;
        return new OrderResponse(order.getId(), order.getNumber(), order.getCustomer(), order.getEmail(), order.getTier().name(), order.getStatus().name(),
            items, count, order.getSubtotal(), order.getDiscount(), order.getTotal(), order.getNote(), created, next);
    }

    public List<OrderResponse> toResponses(List<Order> list) {
        return list.stream().map(this::toResponse).collect(Collectors.toList());
    }

    /** Label shown in the status pill. */
    public String statusLabel(OrderStatus status) {
        String label;
        switch (status) {
            case NEW:
                label = "New";
                break;
            case PAID:
                label = "Paid";
                break;
            case SHIPPED:
                label = "Shipped";
                break;
            case DELIVERED:
                label = "Delivered";
                break;
            case CANCELLED:
                label = "Cancelled";
                break;
            default:
                label = status.name();
        }
        return label;
    }
}
