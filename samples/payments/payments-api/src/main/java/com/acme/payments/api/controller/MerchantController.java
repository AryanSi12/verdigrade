package com.acme.payments.api.controller;

import java.util.List;
import com.acme.payments.dto.MerchantRequest;
import com.acme.payments.dto.MerchantResponse;
import com.acme.payments.service.MerchantService;
import javax.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/merchants")
public class MerchantController {

  private final MerchantService service;

  public MerchantController(MerchantService service) {
    this.service = service;
  }

  @GetMapping
  public List<MerchantResponse> list() {
    return service.list();
  }

  @GetMapping("/{id}")
  public MerchantResponse get(@PathVariable("id") Long id) {
    return service.get(id);
  }

  @PostMapping
  public ResponseEntity<MerchantResponse> create(@Valid @RequestBody MerchantRequest request) {
    return ResponseEntity.status(HttpStatus.CREATED).body(service.create(request));
  }

  @PutMapping("/{id}")
  public MerchantResponse update(@PathVariable("id") Long id, @Valid @RequestBody MerchantRequest request) {
    return service.update(id, request);
  }

  @DeleteMapping("/{id}")
  public ResponseEntity<Void> delete(@PathVariable("id") Long id) {
    service.delete(id);
    return ResponseEntity.noContent().build();
  }
}
