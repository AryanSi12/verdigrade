package com.acme.warehouse.controller;

import java.util.List;
import com.acme.warehouse.dto.SupplierRequest;
import com.acme.warehouse.dto.SupplierResponse;
import com.acme.warehouse.service.SupplierService;
import javax.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/suppliers")
public class SupplierController {

  private final SupplierService service;

  public SupplierController(SupplierService service) {
    this.service = service;
  }

  @GetMapping
  public List<SupplierResponse> list() {
    return service.list();
  }

  @GetMapping("/{id}")
  public SupplierResponse get(@PathVariable("id") Long id) {
    return service.get(id);
  }

  @PostMapping
  public ResponseEntity<SupplierResponse> create(@Valid @RequestBody SupplierRequest request) {
    return ResponseEntity.status(HttpStatus.CREATED).body(service.create(request));
  }

  @PutMapping("/{id}")
  public SupplierResponse update(@PathVariable("id") Long id, @Valid @RequestBody SupplierRequest request) {
    return service.update(id, request);
  }

  @DeleteMapping("/{id}")
  public ResponseEntity<Void> delete(@PathVariable("id") Long id) {
    service.delete(id);
    return ResponseEntity.noContent().build();
  }
}
