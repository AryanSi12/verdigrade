package com.acme.library.controller;

import java.util.List;
import com.acme.library.dto.MemberRequest;
import com.acme.library.dto.MemberResponse;
import com.acme.library.entity.Role;
import com.acme.library.service.MemberService;
import javax.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/members")
public class MemberController {

  private final MemberService memberService;

  public MemberController(MemberService memberService) {
    this.memberService = memberService;
  }

  @GetMapping
  public List<MemberResponse> list() {
    return memberService.list();
  }

  @GetMapping("/{id}")
  public MemberResponse get(@PathVariable Long id) {
    return memberService.get(id);
  }

  @PostMapping
  public ResponseEntity<MemberResponse> create(@Valid @RequestBody MemberRequest request) {
    return ResponseEntity.status(HttpStatus.CREATED).body(memberService.register(request, Role.MEMBER));
  }

  @PutMapping("/{id}/active")
  public MemberResponse setActive(@PathVariable Long id, @RequestParam boolean value) {
    return memberService.setActive(id, value);
  }
}
