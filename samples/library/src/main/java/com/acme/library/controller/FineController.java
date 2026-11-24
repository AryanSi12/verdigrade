package com.acme.library.controller;

import java.math.BigDecimal;
import java.util.List;
import com.acme.library.dto.FineResponse;
import com.acme.library.service.FineService;
import javax.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/fines")
public class FineController {

  private final FineService fineService;

  public FineController(FineService fineService) {
    this.fineService = fineService;
  }

  @GetMapping("/member/{memberId}")
  public List<FineResponse> outstanding(@PathVariable Long memberId) {
    return fineService.outstanding(memberId);
  }

  @GetMapping("/member/{memberId}/total")
  public BigDecimal total(@PathVariable Long memberId) {
    return fineService.outstandingTotal(memberId);
  }

  @PostMapping("/{id}/pay")
  public FineResponse pay(@PathVariable Long id) {
    return fineService.pay(id);
  }
}
