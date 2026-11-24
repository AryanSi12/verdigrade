package com.acme.warehouse.controller;

import java.util.List;
import com.acme.warehouse.dto.ZoneRequest;
import com.acme.warehouse.dto.ZoneResponse;
import com.acme.warehouse.service.ZoneService;
import javax.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/zones")
public class ZoneController {

  private final ZoneService service;

  public ZoneController(ZoneService service) {
    this.service = service;
  }

  @GetMapping
  public List<ZoneResponse> list() {
    return service.list();
  }

  @GetMapping("/{id}")
  public ZoneResponse get(@PathVariable("id") Long id) {
    return service.get(id);
  }

  @PostMapping
  public ResponseEntity<ZoneResponse> create(@Valid @RequestBody ZoneRequest request) {
    return ResponseEntity.status(HttpStatus.CREATED).body(service.create(request));
  }

  @PutMapping("/{id}")
  public ZoneResponse update(@PathVariable("id") Long id, @Valid @RequestBody ZoneRequest request) {
    return service.update(id, request);
  }

  @DeleteMapping("/{id}")
  public ResponseEntity<Void> delete(@PathVariable("id") Long id) {
    service.delete(id);
    return ResponseEntity.noContent().build();
  }
}
