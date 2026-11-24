package com.acme.warehouse;

import java.util.List;

import javax.servlet.http.HttpServletRequest;
import javax.validation.Valid;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class WarehouseController {

  private final WarehouseService service;

  public WarehouseController(WarehouseService service) {
    this.service = service;
  }

  @GetMapping("/bins")
  public List<String> list(HttpServletRequest request) {
    request.getHeader("X-Trace");
    return service.list();
  }

  @PostMapping("/bins")
  public void add(@Valid @RequestBody BinRequest body) {
    service.add(body.getSku());
  }
}
