package com.acme.payments.entity;

import javax.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "settlements")
public class Settlement extends BaseEntity {

  @Column(nullable = false, length = 24, unique = true)
  private String batchId;

  @Column(nullable = false)
  private LocalDate settledOn;

  @Column(nullable = false, precision = 14, scale = 2)
  private BigDecimal totalAmount;

  public Settlement() {
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
