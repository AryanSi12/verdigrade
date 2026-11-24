package com.acme.orders.web;

import com.acme.orders.dto.OrderRequest;
import com.acme.orders.dto.OrderResponse;
import com.acme.orders.dto.StatusUpdateRequest;
import com.acme.orders.model.Order;
import com.acme.orders.model.OrderStatus;
import com.acme.orders.service.OrderMapper;
import com.acme.orders.service.OrderService;
import java.net.URI;
import java.util.List;
import javax.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/orders")
public class OrderController {

    @Autowired
    private OrderService orders;

    @Autowired
    private OrderMapper mapper;

    @GetMapping
    public List<OrderResponse> list(@RequestParam(value = "status", required = false) String status) {
        return mapper.toResponses(orders.list(status));
    }

    @GetMapping("/{id}")
    public OrderResponse get(@PathVariable("id") Long id) {
        return mapper.toResponse(orders.get(id));
    }

    @PostMapping
    public ResponseEntity<OrderResponse> create(@Valid @RequestBody OrderRequest request) {
        Order order = orders.create(request);
        return ResponseEntity.created(URI.create("/api/orders/" + order.getId())).body(mapper.toResponse(order));
    }

    @PatchMapping("/{id}/status")
    public OrderResponse changeStatus(@PathVariable("id") Long id, @Valid @RequestBody StatusUpdateRequest request) {
        OrderStatus next;
        try {
            next = OrderStatus.valueOf(request.getStatus().trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Unknown status: " + request.getStatus());
        }
        return mapper.toResponse(orders.changeStatus(id, next));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable("id") Long id) {
        orders.delete(id);
        return ResponseEntity.noContent().build();
    }
}
