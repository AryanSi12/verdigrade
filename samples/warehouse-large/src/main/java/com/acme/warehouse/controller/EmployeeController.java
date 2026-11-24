package com.acme.warehouse.controller;

import java.util.List;
import com.acme.warehouse.dto.EmployeeRequest;
import com.acme.warehouse.dto.EmployeeResponse;
import com.acme.warehouse.service.EmployeeService;
import javax.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/employees")
public class EmployeeController {

  private final EmployeeService service;

  public EmployeeController(EmployeeService service) {
    this.service = service;
  }

  @GetMapping
  public List<EmployeeResponse> list() {
    return service.list();
  }

  @GetMapping("/{id}")
  public EmployeeResponse get(@PathVariable("id") Long id) {
    return service.get(id);
  }

  @PostMapping
  public ResponseEntity<EmployeeResponse> create(@Valid @RequestBody EmployeeRequest request) {
    return ResponseEntity.status(HttpStatus.CREATED).body(service.create(request));
  }

  @PutMapping("/{id}")
  public EmployeeResponse update(@PathVariable("id") Long id, @Valid @RequestBody EmployeeRequest request) {
    return service.update(id, request);
  }

  @DeleteMapping("/{id}")
  public ResponseEntity<Void> delete(@PathVariable("id") Long id) {
    service.delete(id);
    return ResponseEntity.noContent().build();
  }
}
