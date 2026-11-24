package com.acme.payments.dto;

import java.math.BigDecimal;
import javax.validation.constraints.*;

public class RefundRequest {

  @NotBlank
  @Size(max = 30)
  private String reference;

  @NotNull
  @Positive
  private Long paymentId;

  @NotNull
  @DecimalMin("0.01")
  private BigDecimal amount;

  @Size(max = 200)
  private String reason;

  public RefundRequest() {
  }

  public String getReference() {
    return reference;
  }

  public void setReference(String reference) {
    this.reference = reference;
  }

  public Long getPaymentId() {
    return paymentId;
  }

  public void setPaymentId(Long paymentId) {
    this.paymentId = paymentId;
  }

  public BigDecimal getAmount() {
    return amount;
  }

  public void setAmount(BigDecimal amount) {
    this.amount = amount;
  }

  public String getReason() {
    return reason;
  }

  public void setReason(String reason) {
    this.reason = reason;
  }

}
