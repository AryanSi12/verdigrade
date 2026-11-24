package com.acme.warehouse.controller;

import java.util.List;
import com.acme.warehouse.dto.StockMovementRequest;
import com.acme.warehouse.dto.StockMovementResponse;
import com.acme.warehouse.service.StockMovementService;
import javax.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/stock-movements")
public class StockMovementController {

  private final StockMovementService service;

  public StockMovementController(StockMovementService service) {
    this.service = service;
  }

  @GetMapping
  public List<StockMovementResponse> list() {
    return service.list();
  }

  @GetMapping("/{id}")
  public StockMovementResponse get(@PathVariable("id") Long id) {
    return service.get(id);
  }

  @PostMapping
  public ResponseEntity<StockMovementResponse> create(@Valid @RequestBody StockMovementRequest request) {
    return ResponseEntity.status(HttpStatus.CREATED).body(service.create(request));
  }

  @PutMapping("/{id}")
  public StockMovementResponse update(@PathVariable("id") Long id, @Valid @RequestBody StockMovementRequest request) {
    return service.update(id, request);
  }

  @DeleteMapping("/{id}")
  public ResponseEntity<Void> delete(@PathVariable("id") Long id) {
    service.delete(id);
    return ResponseEntity.noContent().build();
  }
}
