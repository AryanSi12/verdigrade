package com.acme.payments.entity;

import javax.persistence.*;
import java.math.BigDecimal;

@Entity
@Table(name = "refunds")
public class Refund extends BaseEntity {

  @Column(nullable = false, length = 30, unique = true)
  private String reference;

  @Column(nullable = false)
  private Long paymentId;

  @Column(nullable = false, precision = 12, scale = 2)
  private BigDecimal amount;

  @Column(length = 200)
  private String reason;

  public Refund() {
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
