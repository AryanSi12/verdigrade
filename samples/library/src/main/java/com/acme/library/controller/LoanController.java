package com.acme.library.controller;

import java.util.List;
import com.acme.library.dto.LoanRequest;
import com.acme.library.dto.LoanResponse;
import com.acme.library.service.LoanService;
import javax.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/loans")
public class LoanController {

  private final LoanService loanService;

  public LoanController(LoanService loanService) {
    this.loanService = loanService;
  }

  @PostMapping
  public ResponseEntity<LoanResponse> borrow(@Valid @RequestBody LoanRequest request) {
    return ResponseEntity.status(HttpStatus.CREATED).body(loanService.borrow(request));
  }

  @PostMapping("/{id}/return")
  public LoanResponse giveBack(@PathVariable Long id) {
    return loanService.giveBack(id);
  }

  @GetMapping("/member/{memberId}")
  public List<LoanResponse> forMember(@PathVariable Long memberId) {
    return loanService.forMember(memberId);
  }

  @GetMapping("/overdue")
  @PreAuthorize("hasAnyRole('LIBRARIAN','ADMIN')")
  public List<LoanResponse> overdue() {
    return loanService.overdue();
  }

  @GetMapping(value = "/overdue/report", produces = MediaType.TEXT_PLAIN_VALUE)
  @PreAuthorize("hasAnyRole('LIBRARIAN','ADMIN')")
  public String overdueReport() {
    return loanService.overdueReportCsv();
  }
}
