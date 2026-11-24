package com.acme.orders.dto;

import java.math.BigDecimal;
import java.util.List;

public class OrderResponse {

    private final Long id;
    private final String number;
    private final String customer;
    private final String email;
    private final String tier;
    private final String status;
    private final List<LineItemResponse> items;
    private final int itemCount;
    private final BigDecimal subtotal;
    private final BigDecimal discount;
    private final BigDecimal total;
    private final String note;
    private final String createdAt;
    private final List<String> nextStatuses;

    public OrderResponse(Long id, String number, String customer, String email, String tier, String status, List<LineItemResponse> items,
            int itemCount, BigDecimal subtotal, BigDecimal discount, BigDecimal total, String note, String createdAt, List<String> nextStatuses) {
        this.id = id;
        this.number = number;
        this.customer = customer;
        this.email = email;
        this.tier = tier;
        this.status = status;
        this.items = items;
        this.itemCount = itemCount;
        this.subtotal = subtotal;
        this.discount = discount;
        this.total = total;
        this.note = note;
        this.createdAt = createdAt;
        this.nextStatuses = nextStatuses;
    }

    public Long getId() {
        return id;
    }

    public String getNumber() {
        return number;
    }

    public String getCustomer() {
        return customer;
    }

    public String getEmail() {
        return email;
    }

    public String getTier() {
        return tier;
    }

    public String getStatus() {
        return status;
    }

    public List<LineItemResponse> getItems() {
        return items;
    }

    public int getItemCount() {
        return itemCount;
    }

    public BigDecimal getSubtotal() {
        return subtotal;
    }

    public BigDecimal getDiscount() {
        return discount;
    }

    public BigDecimal getTotal() {
        return total;
    }

    public String getNote() {
        return note;
    }

    public String getCreatedAt() {
        return createdAt;
    }

    public List<String> getNextStatuses() {
        return nextStatuses;
    }
}
