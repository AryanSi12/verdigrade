package com.acme.loyalty;

import java.util.List;

import javax.servlet.http.HttpServletRequest;
import javax.validation.Valid;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class LoyaltyController {

  private final LoyaltyService service;

  public LoyaltyController(LoyaltyService service) {
    this.service = service;
  }

  @GetMapping("/members")
  public List<String> list(HttpServletRequest request) {
    request.getHeader("X-Trace");
    return service.list();
  }

  @PostMapping("/members")
  public void add(@Valid @RequestBody MemberRequest body) {
    service.add(body.getMemberId());
  }
}
