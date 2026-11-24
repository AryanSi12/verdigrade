package com.acme.payments.entity;

import javax.persistence.*;
import java.time.LocalDate;

@Entity
@Table(name = "disputes")
public class Dispute extends BaseEntity {

  @Column(nullable = false, length = 24, unique = true)
  private String caseNumber;

  @Column(nullable = false)
  private Long paymentId;

  @Column(nullable = false, length = 200)
  private String reason;

  @Column(nullable = false)
  private LocalDate openedOn;

  public Dispute() {
  }

  public String getCaseNumber() {
    return caseNumber;
  }

  public void setCaseNumber(String caseNumber) {
    this.caseNumber = caseNumber;
  }

  public Long getPaymentId() {
    return paymentId;
  }

  public void setPaymentId(Long paymentId) {
    this.paymentId = paymentId;
  }

  public String getReason() {
    return reason;
  }

  public void setReason(String reason) {
    this.reason = reason;
  }

  public LocalDate getOpenedOn() {
    return openedOn;
  }

  public void setOpenedOn(LocalDate openedOn) {
    this.openedOn = openedOn;
  }

}
