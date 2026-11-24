package com.acme.payments.api.controller;

import com.acme.payments.common.Money;
import com.acme.payments.dto.PaymentResponse;
import com.acme.payments.dto.RefundResponse;
import com.acme.payments.entity.Refund;
import com.acme.payments.mapper.PaymentMapper;
import com.acme.payments.mapper.RefundMapper;
import com.acme.payments.service.PaymentProcessor;
import java.math.BigDecimal;
import javax.validation.Valid;
import javax.validation.constraints.DecimalMin;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** State changes on a payment: POST /api/payment-flow/{id}/capture and /refund. */
@RestController
@RequestMapping("/api/payment-flow")
public class PaymentFlowController {

  public static class RefundBody {
    @NotBlank
    private String reference;
    @NotNull
    @DecimalMin("0.01")
    private BigDecimal amount;
    private String reason;

    public String getReference() { return reference; }
    public void setReference(String reference) { this.reference = reference; }
    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }
    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
  }

  private final PaymentProcessor processor;

  public PaymentFlowController(PaymentProcessor processor) {
    this.processor = processor;
  }

  @PostMapping("/{id}/capture")
  public PaymentResponse capture(@PathVariable("id") Long id) {
    return PaymentMapper.toResponse(processor.capture(id));
  }

  @PostMapping("/{id}/refund")
  public ResponseEntity<RefundResponse> refund(@PathVariable("id") Long id, @Valid @RequestBody RefundBody body) {
    Refund refund = processor.refund(id, body.getReference(), Money.of(body.getAmount(), "INR"), body.getReason());
    return ResponseEntity.status(HttpStatus.CREATED).body(RefundMapper.toResponse(refund));
  }
}
