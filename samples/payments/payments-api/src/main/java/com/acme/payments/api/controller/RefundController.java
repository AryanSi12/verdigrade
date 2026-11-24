package com.acme.payments.api.controller;

import java.util.List;
import com.acme.payments.dto.RefundRequest;
import com.acme.payments.dto.RefundResponse;
import com.acme.payments.service.RefundService;
import javax.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/refunds")
public class RefundController {

  private final RefundService service;

  public RefundController(RefundService service) {
    this.service = service;
  }

  @GetMapping
  public List<RefundResponse> list() {
    return service.list();
  }

  @GetMapping("/{id}")
  public RefundResponse get(@PathVariable("id") Long id) {
    return service.get(id);
  }

  @PostMapping
  public ResponseEntity<RefundResponse> create(@Valid @RequestBody RefundRequest request) {
    return ResponseEntity.status(HttpStatus.CREATED).body(service.create(request));
  }

  @PutMapping("/{id}")
  public RefundResponse update(@PathVariable("id") Long id, @Valid @RequestBody RefundRequest request) {
    return service.update(id, request);
  }

  @DeleteMapping("/{id}")
  public ResponseEntity<Void> delete(@PathVariable("id") Long id) {
    service.delete(id);
    return ResponseEntity.noContent().build();
  }
}
