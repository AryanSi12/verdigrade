package com.acme.library.controller;

import javax.validation.Valid;

import com.acme.library.dto.MemberRequest;
import com.acme.library.dto.MemberResponse;
import com.acme.library.entity.Role;
import com.acme.library.service.MemberService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Self-service sign-up. Everything else uses HTTP Basic with the registered username and password. */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

  private final MemberService memberService;

  public AuthController(MemberService memberService) {
    this.memberService = memberService;
  }

  @PostMapping("/register")
  public ResponseEntity<MemberResponse> register(@Valid @RequestBody MemberRequest request) {
    return ResponseEntity.status(HttpStatus.CREATED).body(memberService.register(request, Role.MEMBER));
  }
}
