package com.acme.library.entity;

import javax.persistence.*;
import java.math.BigDecimal;

@Entity
@Table(name = "fines")
public class Fine extends BaseEntity {

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  private Loan loan;

  @Column(nullable = false, precision = 8, scale = 2)
  private BigDecimal amount;

  private boolean paid;

  @Column(length = 200)
  private String reason;

  public Fine() {
  }

  public Loan getLoan() {
    return loan;
  }

  public void setLoan(Loan loan) {
    this.loan = loan;
  }

  public BigDecimal getAmount() {
    return amount;
  }

  public void setAmount(BigDecimal amount) {
    this.amount = amount;
  }

  public boolean isPaid() {
    return paid;
  }

  public void setPaid(boolean paid) {
    this.paid = paid;
  }

  public String getReason() {
    return reason;
  }

  public void setReason(String reason) {
    this.reason = reason;
  }

}
