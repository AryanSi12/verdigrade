package com.acme.warehouse.controller;

import java.util.List;
import com.acme.warehouse.dto.CarrierRequest;
import com.acme.warehouse.dto.CarrierResponse;
import com.acme.warehouse.service.CarrierService;
import javax.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/carriers")
public class CarrierController {

  private final CarrierService service;

  public CarrierController(CarrierService service) {
    this.service = service;
  }

  @GetMapping
  public List<CarrierResponse> list() {
    return service.list();
  }

  @GetMapping("/{id}")
  public CarrierResponse get(@PathVariable("id") Long id) {
    return service.get(id);
  }

  @PostMapping
  public ResponseEntity<CarrierResponse> create(@Valid @RequestBody CarrierRequest request) {
    return ResponseEntity.status(HttpStatus.CREATED).body(service.create(request));
  }

  @PutMapping("/{id}")
  public CarrierResponse update(@PathVariable("id") Long id, @Valid @RequestBody CarrierRequest request) {
    return service.update(id, request);
  }

  @DeleteMapping("/{id}")
  public ResponseEntity<Void> delete(@PathVariable("id") Long id) {
    service.delete(id);
    return ResponseEntity.noContent().build();
  }
}
