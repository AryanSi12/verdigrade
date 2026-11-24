package com.acme.payments.api.controller;

import java.util.List;
import com.acme.payments.dto.AccountRequest;
import com.acme.payments.dto.AccountResponse;
import com.acme.payments.service.AccountService;
import javax.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/accounts")
public class AccountController {

  private final AccountService service;

  public AccountController(AccountService service) {
    this.service = service;
  }

  @GetMapping
  public List<AccountResponse> list() {
    return service.list();
  }

  @GetMapping("/{id}")
  public AccountResponse get(@PathVariable("id") Long id) {
    return service.get(id);
  }

  @PostMapping
  public ResponseEntity<AccountResponse> create(@Valid @RequestBody AccountRequest request) {
    return ResponseEntity.status(HttpStatus.CREATED).body(service.create(request));
  }

  @PutMapping("/{id}")
  public AccountResponse update(@PathVariable("id") Long id, @Valid @RequestBody AccountRequest request) {
    return service.update(id, request);
  }

  @DeleteMapping("/{id}")
  public ResponseEntity<Void> delete(@PathVariable("id") Long id) {
    service.delete(id);
    return ResponseEntity.noContent().build();
  }
}
