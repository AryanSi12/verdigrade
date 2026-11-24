package com.acme.payments.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

public class SettlementResponse {

  private Long id;

  private String batchId;

  private LocalDate settledOn;

  private BigDecimal totalAmount;

  public SettlementResponse() {
  }

  public Long getId() {
    return id;
  }

  public void setId(Long id) {
    this.id = id;
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
