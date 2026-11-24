package com.acme.payments.dto;

import java.time.LocalDate;
import javax.validation.constraints.*;

public class DisputeRequest {

  @NotBlank
  @Size(max = 24)
  private String caseNumber;

  @NotNull
  @Positive
  private Long paymentId;

  @NotBlank
  @Size(max = 200)
  private String reason;

  @NotNull
  @PastOrPresent
  private LocalDate openedOn;

  public DisputeRequest() {
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
