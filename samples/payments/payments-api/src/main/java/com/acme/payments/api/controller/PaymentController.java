package com.acme.payments.api.controller;

import java.util.List;
import com.acme.payments.dto.PaymentRequest;
import com.acme.payments.dto.PaymentResponse;
import com.acme.payments.service.PaymentService;
import javax.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/payments")
public class PaymentController {

  private final PaymentService service;

  public PaymentController(PaymentService service) {
    this.service = service;
  }

  @GetMapping
  public List<PaymentResponse> list() {
    return service.list();
  }

  @GetMapping("/{id}")
  public PaymentResponse get(@PathVariable("id") Long id) {
    return service.get(id);
  }

  @PostMapping
  public ResponseEntity<PaymentResponse> create(@Valid @RequestBody PaymentRequest request) {
    return ResponseEntity.status(HttpStatus.CREATED).body(service.create(request));
  }

  @PutMapping("/{id}")
  public PaymentResponse update(@PathVariable("id") Long id, @Valid @RequestBody PaymentRequest request) {
    return service.update(id, request);
  }

  @DeleteMapping("/{id}")
  public ResponseEntity<Void> delete(@PathVariable("id") Long id) {
    service.delete(id);
    return ResponseEntity.noContent().build();
  }
}
