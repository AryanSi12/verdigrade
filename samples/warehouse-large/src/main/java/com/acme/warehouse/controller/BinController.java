package com.acme.warehouse.controller;

import java.util.List;
import com.acme.warehouse.dto.BinRequest;
import com.acme.warehouse.dto.BinResponse;
import com.acme.warehouse.service.BinService;
import javax.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/bins")
public class BinController {

  private final BinService service;

  public BinController(BinService service) {
    this.service = service;
  }

  @GetMapping
  public List<BinResponse> list() {
    return service.list();
  }

  @GetMapping("/{id}")
  public BinResponse get(@PathVariable("id") Long id) {
    return service.get(id);
  }

  @PostMapping
  public ResponseEntity<BinResponse> create(@Valid @RequestBody BinRequest request) {
    return ResponseEntity.status(HttpStatus.CREATED).body(service.create(request));
  }

  @PutMapping("/{id}")
  public BinResponse update(@PathVariable("id") Long id, @Valid @RequestBody BinRequest request) {
    return service.update(id, request);
  }

  @DeleteMapping("/{id}")
  public ResponseEntity<Void> delete(@PathVariable("id") Long id) {
    service.delete(id);
    return ResponseEntity.noContent().build();
  }
}
