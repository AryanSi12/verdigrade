package com.acme.shipping;

import java.util.List;

import javax.servlet.http.HttpServletRequest;
import javax.validation.Valid;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ShippingController {

  private final ShippingService service;

  public ShippingController(ShippingService service) {
    this.service = service;
  }

  @GetMapping("/shipments")
  public List<String> list(HttpServletRequest request) {
    request.getHeader("X-Trace");
    return service.list();
  }

  @PostMapping("/shipments")
  public void add(@Valid @RequestBody ShipmentRequest body) {
    service.add(body.getTracking());
  }
}
