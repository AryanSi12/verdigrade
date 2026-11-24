package com.acme.warehouse.controller;

import java.util.List;
import com.acme.warehouse.dto.CustomerRequest;
import com.acme.warehouse.dto.CustomerResponse;
import com.acme.warehouse.service.CustomerService;
import javax.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/customers")
public class CustomerController {

  private final CustomerService service;

  public CustomerController(CustomerService service) {
    this.service = service;
  }

  @GetMapping
  public List<CustomerResponse> list() {
    return service.list();
  }

  @GetMapping("/{id}")
  public CustomerResponse get(@PathVariable("id") Long id) {
    return service.get(id);
  }

  @PostMapping
  public ResponseEntity<CustomerResponse> create(@Valid @RequestBody CustomerRequest request) {
    return ResponseEntity.status(HttpStatus.CREATED).body(service.create(request));
  }

  @PutMapping("/{id}")
  public CustomerResponse update(@PathVariable("id") Long id, @Valid @RequestBody CustomerRequest request) {
    return service.update(id, request);
  }

  @DeleteMapping("/{id}")
  public ResponseEntity<Void> delete(@PathVariable("id") Long id) {
    service.delete(id);
    return ResponseEntity.noContent().build();
  }
}
