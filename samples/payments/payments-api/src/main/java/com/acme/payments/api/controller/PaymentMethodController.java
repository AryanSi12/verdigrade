package com.acme.payments.api.controller;

import java.util.List;
import com.acme.payments.dto.PaymentMethodRequest;
import com.acme.payments.dto.PaymentMethodResponse;
import com.acme.payments.service.PaymentMethodService;
import javax.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/payment-methods")
public class PaymentMethodController {

  private final PaymentMethodService service;

  public PaymentMethodController(PaymentMethodService service) {
    this.service = service;
  }

  @GetMapping
  public List<PaymentMethodResponse> list() {
    return service.list();
  }

  @GetMapping("/{id}")
  public PaymentMethodResponse get(@PathVariable("id") Long id) {
    return service.get(id);
  }

  @PostMapping
  public ResponseEntity<PaymentMethodResponse> create(@Valid @RequestBody PaymentMethodRequest request) {
    return ResponseEntity.status(HttpStatus.CREATED).body(service.create(request));
  }

  @PutMapping("/{id}")
  public PaymentMethodResponse update(@PathVariable("id") Long id, @Valid @RequestBody PaymentMethodRequest request) {
    return service.update(id, request);
  }

  @DeleteMapping("/{id}")
  public ResponseEntity<Void> delete(@PathVariable("id") Long id) {
    service.delete(id);
    return ResponseEntity.noContent().build();
  }
}
