package com.acme.orders.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

public class DashboardStats {

    private final int orderCount;
    private final int openCount;
    private final BigDecimal revenue;
    private final BigDecimal averageOrder;
    private final Map<String, Integer> byStatus;
    private final List<String> topProducts;

    public DashboardStats(int orderCount, int openCount, BigDecimal revenue, BigDecimal averageOrder, Map<String, Integer> byStatus, List<String> topProducts) {
        this.orderCount = orderCount;
        this.openCount = openCount;
        this.revenue = revenue;
        this.averageOrder = averageOrder;
        this.byStatus = byStatus;
        this.topProducts = topProducts;
    }

    public int getOrderCount() {
        return orderCount;
    }

    public int getOpenCount() {
        return openCount;
    }

    public BigDecimal getRevenue() {
        return revenue;
    }

    public BigDecimal getAverageOrder() {
        return averageOrder;
    }

    public Map<String, Integer> getByStatus() {
        return byStatus;
    }

    public List<String> getTopProducts() {
        return topProducts;
    }
}
