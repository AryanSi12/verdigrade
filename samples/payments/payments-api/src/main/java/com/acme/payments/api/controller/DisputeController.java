package com.acme.payments.api.controller;

import java.util.List;
import com.acme.payments.dto.DisputeRequest;
import com.acme.payments.dto.DisputeResponse;
import com.acme.payments.service.DisputeService;
import javax.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/disputes")
public class DisputeController {

  private final DisputeService service;

  public DisputeController(DisputeService service) {
    this.service = service;
  }

  @GetMapping
  public List<DisputeResponse> list() {
    return service.list();
  }

  @GetMapping("/{id}")
  public DisputeResponse get(@PathVariable("id") Long id) {
    return service.get(id);
  }

  @PostMapping
  public ResponseEntity<DisputeResponse> create(@Valid @RequestBody DisputeRequest request) {
    return ResponseEntity.status(HttpStatus.CREATED).body(service.create(request));
  }

  @PutMapping("/{id}")
  public DisputeResponse update(@PathVariable("id") Long id, @Valid @RequestBody DisputeRequest request) {
    return service.update(id, request);
  }

  @DeleteMapping("/{id}")
  public ResponseEntity<Void> delete(@PathVariable("id") Long id) {
    service.delete(id);
    return ResponseEntity.noContent().build();
  }
}
