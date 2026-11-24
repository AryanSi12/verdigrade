package com.acme.tickets.controller;

import java.util.List;
import com.acme.tickets.dto.OrderRequest;
import com.acme.tickets.dto.OrderResponse;
import com.acme.tickets.service.OrderService;
import javax.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/orders")
public class OrderController {

  private final OrderService orderService;

  public OrderController(OrderService orderService) {
    this.orderService = orderService;
  }

  @PostMapping
  public ResponseEntity<OrderResponse> place(@Valid @RequestBody OrderRequest request) {
    return ResponseEntity.status(HttpStatus.CREATED).body(orderService.place(request));
  }

  @GetMapping("/{id}")
  public OrderResponse get(@PathVariable("id") Long id) {
    return orderService.get(id);
  }

  @GetMapping("/customer/{customerId}")
  public List<OrderResponse> forCustomer(@PathVariable("customerId") Long customerId) {
    return orderService.forCustomer(customerId);
  }

  @PostMapping("/{id}/pay")
  public OrderResponse pay(@PathVariable("id") Long id) {
    return orderService.pay(id);
  }

  @PostMapping("/{id}/cancel")
  public OrderResponse cancel(@PathVariable("id") Long id) {
    return orderService.cancel(id);
  }

  @PostMapping("/{id}/refund")
  public OrderResponse refund(@PathVariable("id") Long id) {
    return orderService.refund(id);
  }
}
