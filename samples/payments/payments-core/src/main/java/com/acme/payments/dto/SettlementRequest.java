package com.acme.payments.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import javax.validation.constraints.*;

public class SettlementRequest {

  @NotBlank
  @Size(max = 24)
  private String batchId;

  @NotNull
  @PastOrPresent
  private LocalDate settledOn;

  @NotNull
  @PositiveOrZero
  private BigDecimal totalAmount;

  public SettlementRequest() {
  }

  public String getBatchId() {
    return batchId;
  }

  public void setBatchId(String batchId) {
    this.batchId = batchId;
  }

  public LocalDate getSettledOn() {
    return settledOn;
  }

  public void setSettledOn(LocalDate settledOn) {
    this.settledOn = settledOn;
  }

  public BigDecimal getTotalAmount() {
    return totalAmount;
  }

  public void setTotalAmount(BigDecimal totalAmount) {
    this.totalAmount = totalAmount;
  }

}
