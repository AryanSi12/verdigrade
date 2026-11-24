package com.acme.warehouse.controller;

import java.util.List;
import com.acme.warehouse.dto.PurchaseOrderRequest;
import com.acme.warehouse.dto.PurchaseOrderResponse;
import com.acme.warehouse.service.PurchaseOrderService;
import javax.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/purchase-orders")
public class PurchaseOrderController {

  private final PurchaseOrderService service;

  public PurchaseOrderController(PurchaseOrderService service) {
    this.service = service;
  }

  @GetMapping
  public List<PurchaseOrderResponse> list() {
    return service.list();
  }

  @GetMapping("/{id}")
  public PurchaseOrderResponse get(@PathVariable("id") Long id) {
    return service.get(id);
  }

  @PostMapping
  public ResponseEntity<PurchaseOrderResponse> create(@Valid @RequestBody PurchaseOrderRequest request) {
    return ResponseEntity.status(HttpStatus.CREATED).body(service.create(request));
  }

  @PutMapping("/{id}")
  public PurchaseOrderResponse update(@PathVariable("id") Long id, @Valid @RequestBody PurchaseOrderRequest request) {
    return service.update(id, request);
  }

  @DeleteMapping("/{id}")
  public ResponseEntity<Void> delete(@PathVariable("id") Long id) {
    service.delete(id);
    return ResponseEntity.noContent().build();
  }
}
