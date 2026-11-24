package com.acme.orders.service;

import com.acme.orders.dto.LineItemRequest;
import com.acme.orders.dto.OrderRequest;
import com.acme.orders.model.*;
import com.acme.orders.repo.OrderRepository;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class OrderService {

    @Autowired
    private OrderRepository repository;

    @Autowired
    private PricingService pricing;

    public List<Order> list(String status) {
        List<Order> all = repository.findAll();
        if (status == null || status.isEmpty() || status.equalsIgnoreCase("ALL")) {
            return all;
        }
        final OrderStatus wanted = OrderStatus.valueOf(status.toUpperCase());
        return all.stream().filter(order -> order.getStatus() == wanted).collect(Collectors.toList());
    }

    public Order get(Long id) {
        Order order = repository.findById(id);
        if (order == null) {
            throw new OrderNotFoundException(id);
        }
        return order;
    }

    public Order create(OrderRequest request) {
        Order order = new Order();
        order.setCustomer(request.getCustomer().trim());
        order.setEmail(request.getEmail().trim().toLowerCase());
        order.setTier(pricing.parseTier(request.getTier()));
        order.setNote(request.getNote());
        List<LineItem> items = new ArrayList<LineItem>();
        for (LineItemRequest line : request.getItems()) {
            items.add(new LineItem(line.getSku().trim().toUpperCase(), line.getName().trim(), line.getQuantity(), line.getUnitPrice()));
        }
        order.setItems(items);
        price(order);
        LocalDateTime now = LocalDateTime.now();
        order.setCreatedAt(now);
        order.setUpdatedAt(now);
        repository.save(order);
        order.setNumber(orderNumber(order.getId(), now));
        System.out.println("Created order " + order.getNumber() + " for " + order.getCustomer() + " total " + order.getTotal());
        return order;
    }

    public Order changeStatus(Long id, OrderStatus next) {
        Order order = get(id);
        if (!allowedNext(order.getStatus()).contains(next)) {
            throw new InvalidTransitionException(order.getStatus(), next);
        }
        order.setStatus(next);
        order.setUpdatedAt(LocalDateTime.now());
        System.out.println("Order " + order.getNumber() + " is now " + next);
        return order;
    }

    public void delete(Long id) {
        Order order = get(id);
        if (order.getStatus() != OrderStatus.NEW && order.getStatus() != OrderStatus.CANCELLED) {
            throw new IllegalStateException("Only new or cancelled orders can be deleted");
        }
        repository.delete(id);
    }

    /** Where an order may go next. */
    public List<OrderStatus> allowedNext(OrderStatus status) {
        List<OrderStatus> next = new ArrayList<OrderStatus>();
        switch (status) {
            case NEW:
                next.add(OrderStatus.PAID);
                next.add(OrderStatus.CANCELLED);
                break;
            case PAID:
                next.add(OrderStatus.SHIPPED);
                next.add(OrderStatus.CANCELLED);
                break;
            case SHIPPED:
                next.add(OrderStatus.DELIVERED);
                break;
            case DELIVERED:
                break;
            case CANCELLED:
                break;
            default:
                break;
        }
        return next;
    }

    private void price(Order order) {
        BigDecimal subtotal = pricing.subtotal(order.getItems());
        BigDecimal discount = pricing.discount(order.getTier(), subtotal);
        order.setSubtotal(subtotal);
        order.setDiscount(discount);
        order.setTotal(subtotal.subtract(discount));
    }

    private String orderNumber(Long id, LocalDateTime when) {
        StringBuffer number = new StringBuffer("OD-");
        number.append(when.getYear());
        number.append("-");
        number.append(id);
        return number.toString();
    }

    private boolean isLargeOrder(Order order) {
        Integer limit = new Integer(1000);
        return order.getTotal().intValue() > limit.intValue();
    }

    private String describe(Order order) {
        String text = order.getNumber() + " (" + order.getCustomer() + ")";
        return text;
    }
}
