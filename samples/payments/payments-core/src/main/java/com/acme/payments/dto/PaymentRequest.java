package com.acme.payments.dto;

import com.acme.payments.common.ValidCurrency;
import java.math.BigDecimal;
import javax.validation.constraints.*;

public class PaymentRequest {

  @NotBlank
  @Size(max = 30)
  private String reference;

  @NotNull
  @Positive
  private Long merchantId;

  @NotNull
  @DecimalMin("0.01")
  @Digits(integer = 10, fraction = 2)
  private BigDecimal amount;

  @NotBlank
  @ValidCurrency
  private String currency;

  @NotBlank
  @Pattern(regexp = "AUTHORIZED|CAPTURED|REFUNDED|FAILED")
  @Size(max = 12)
  private String status;

  public PaymentRequest() {
  }

  public String getReference() {
    return reference;
  }

  public void setReference(String reference) {
    this.reference = reference;
  }

  public Long getMerchantId() {
    return merchantId;
  }

  public void setMerchantId(Long merchantId) {
    this.merchantId = merchantId;
  }

  public BigDecimal getAmount() {
    return amount;
  }

  public void setAmount(BigDecimal amount) {
    this.amount = amount;
  }

  public String getCurrency() {
    return currency;
  }

  public void setCurrency(String currency) {
    this.currency = currency;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }

}
