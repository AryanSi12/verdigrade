package com.acme.warehouse.controller;

import java.util.List;
import com.acme.warehouse.dto.ShipmentRequest;
import com.acme.warehouse.dto.ShipmentResponse;
import com.acme.warehouse.service.ShipmentService;
import javax.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/shipments")
public class ShipmentController {

  private final ShipmentService service;

  public ShipmentController(ShipmentService service) {
    this.service = service;
  }

  @GetMapping
  public List<ShipmentResponse> list() {
    return service.list();
  }

  @GetMapping("/{id}")
  public ShipmentResponse get(@PathVariable("id") Long id) {
    return service.get(id);
  }

  @PostMapping
  public ResponseEntity<ShipmentResponse> create(@Valid @RequestBody ShipmentRequest request) {
    return ResponseEntity.status(HttpStatus.CREATED).body(service.create(request));
  }

  @PutMapping("/{id}")
  public ShipmentResponse update(@PathVariable("id") Long id, @Valid @RequestBody ShipmentRequest request) {
    return service.update(id, request);
  }

  @DeleteMapping("/{id}")
  public ResponseEntity<Void> delete(@PathVariable("id") Long id) {
    service.delete(id);
    return ResponseEntity.noContent().build();
  }
}
