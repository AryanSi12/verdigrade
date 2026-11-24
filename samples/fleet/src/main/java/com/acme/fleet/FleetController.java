package com.acme.fleet;

import java.util.List;

import javax.servlet.http.HttpServletRequest;
import javax.validation.Valid;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class FleetController {

  private final FleetService service;

  public FleetController(FleetService service) {
    this.service = service;
  }

  @GetMapping("/vehicles")
  public List<String> list(HttpServletRequest request) {
    request.getHeader("X-Trace");
    return service.list();
  }

  @PostMapping("/vehicles")
  public void add(@Valid @RequestBody VehicleRequest body) {
    service.add(body.getPlate());
  }
}
