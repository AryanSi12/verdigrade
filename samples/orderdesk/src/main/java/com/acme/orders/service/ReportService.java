package com.acme.orders.service;

import com.acme.orders.dto.DashboardStats;
import com.acme.orders.model.LineItem;
import com.acme.orders.model.Order;
import com.acme.orders.model.OrderStatus;
import com.acme.orders.repo.OrderRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/** Dashboard numbers and the CSV export. */
@Service
public class ReportService {

    @Autowired
    private OrderRepository repository;

    public DashboardStats dashboard() {
        List<Order> orders = repository.findAll();
        BigDecimal revenue = BigDecimal.ZERO;
        int counted = 0;
        int open = 0;
        Map<String, Integer> byStatus = new LinkedHashMap<String, Integer>();
        for (OrderStatus status : OrderStatus.values()) {
            byStatus.put(status.name(), new Integer(0));
        }
        Map<String, Integer> units = new HashMap<String, Integer>();
        for (Order order : orders) {
            byStatus.put(order.getStatus().name(), byStatus.get(order.getStatus().name()) + 1);
            if (order.getStatus() != OrderStatus.CANCELLED) {
                revenue = revenue.add(order.getTotal());
                counted++;
                for (LineItem item : order.getItems()) {
                    Integer before = units.get(item.getName());
                    if (before == null) {
                        before = 0;
                    }
                    units.put(item.getName(), before + item.getQuantity());
                }
            }
            if (order.getStatus() == OrderStatus.NEW || order.getStatus() == OrderStatus.PAID || order.getStatus() == OrderStatus.SHIPPED) {
                open++;
            }
        }
        BigDecimal average = counted == 0 ? BigDecimal.ZERO : revenue.divide(BigDecimal.valueOf(counted), 2, RoundingMode.HALF_UP);
        List<String> top = units.entrySet().stream()
            .sorted((a, b) -> b.getValue().compareTo(a.getValue()))
            .limit(3)
            .map(entry -> entry.getKey())
            .collect(Collectors.toList());
        return new DashboardStats(orders.size(), open, revenue.setScale(2, RoundingMode.HALF_UP), average, byStatus, top);
    }

    public String csv() {
        StringBuffer out = new StringBuffer("number,customer,status,items,total,created\n");
        for (Order order : repository.findAll()) {
            try {
                out.append(order.getNumber()).append(',')
                    .append(quote(order.getCustomer())).append(',')
                    .append(order.getStatus().name()).append(',')
                    .append(order.getItems().size()).append(',')
                    .append(order.getTotal().toPlainString()).append(',')
                    .append(order.getCreatedAt().toLocalDate())
                    .append('\n');
            } catch (RuntimeException e) {
                e.printStackTrace();
            }
        }
        return out.toString();
    }

    private String quote(String value) {
        if (value == null) {
            return "";
        }
        if (value.contains(",") || value.contains("\"")) {
            return "\"" + value.replace("\"", "\"\"") + "\"";
        }
        return value;
    }

    private List<Order> recent(int days) {
        List<Order> list = repository.findAll();
        return list.subList(0, Math.min(days, list.size()));
    }
}
