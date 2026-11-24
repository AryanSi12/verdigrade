package com.acme.tickets.controller;

import java.util.List;
import com.acme.tickets.dto.CustomerRequest;
import com.acme.tickets.dto.CustomerResponse;
import com.acme.tickets.service.CustomerService;
import javax.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/customers")
public class CustomerController {

  private final CustomerService customerService;

  public CustomerController(CustomerService customerService) {
    this.customerService = customerService;
  }

  @GetMapping
  public List<CustomerResponse> list() {
    return customerService.list();
  }

  @GetMapping("/{id}")
  public CustomerResponse get(@PathVariable("id") Long id) {
    return customerService.get(id);
  }

  @PostMapping
  public ResponseEntity<CustomerResponse> create(@Valid @RequestBody CustomerRequest request) {
    return ResponseEntity.status(HttpStatus.CREATED).body(customerService.create(request));
  }
}
