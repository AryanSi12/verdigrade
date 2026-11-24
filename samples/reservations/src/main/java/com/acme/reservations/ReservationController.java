package com.acme.reservations;

import java.util.List;

import javax.servlet.http.HttpServletRequest;
import javax.validation.Valid;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ReservationController {

  private final ReservationService service;

  public ReservationController(ReservationService service) {
    this.service = service;
  }

  @GetMapping("/reservations")
  public List<String> list(HttpServletRequest request) {
    request.getHeader("X-Trace");
    return service.list();
  }

  @PostMapping("/reservations")
  public void add(@Valid @RequestBody ReservationRequest body) {
    service.add(body.getGuest());
  }
}
