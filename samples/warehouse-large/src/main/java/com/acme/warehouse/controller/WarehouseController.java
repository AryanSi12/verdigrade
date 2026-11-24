package com.acme.warehouse.controller;

import java.util.List;
import com.acme.warehouse.dto.WarehouseRequest;
import com.acme.warehouse.dto.WarehouseResponse;
import com.acme.warehouse.service.WarehouseService;
import javax.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/warehouses")
public class WarehouseController {

  private final WarehouseService service;

  public WarehouseController(WarehouseService service) {
    this.service = service;
  }

  @GetMapping
  public List<WarehouseResponse> list() {
    return service.list();
  }

  @GetMapping("/{id}")
  public WarehouseResponse get(@PathVariable("id") Long id) {
    return service.get(id);
  }

  @PostMapping
  public ResponseEntity<WarehouseResponse> create(@Valid @RequestBody WarehouseRequest request) {
    return ResponseEntity.status(HttpStatus.CREATED).body(service.create(request));
  }

  @PutMapping("/{id}")
  public WarehouseResponse update(@PathVariable("id") Long id, @Valid @RequestBody WarehouseRequest request) {
    return service.update(id, request);
  }

  @DeleteMapping("/{id}")
  public ResponseEntity<Void> delete(@PathVariable("id") Long id) {
    service.delete(id);
    return ResponseEntity.noContent().build();
  }
}
