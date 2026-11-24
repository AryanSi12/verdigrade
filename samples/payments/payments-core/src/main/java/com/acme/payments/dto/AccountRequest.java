package com.acme.payments.dto;

import com.acme.payments.common.ValidCurrency;
import javax.validation.constraints.*;

public class AccountRequest {

  @NotBlank
  @Pattern(regexp = "[A-Z0-9-]+")
  @Size(max = 20)
  private String accountNumber;

  @NotBlank
  @Size(max = 120)
  private String holderName;

  @NotBlank
  @ValidCurrency
  private String currency;

  public AccountRequest() {
  }

  public String getAccountNumber() {
    return accountNumber;
  }

  public void setAccountNumber(String accountNumber) {
    this.accountNumber = accountNumber;
  }

  public String getHolderName() {
    return holderName;
  }

  public void setHolderName(String holderName) {
    this.holderName = holderName;
  }

  public String getCurrency() {
    return currency;
  }

  public void setCurrency(String currency) {
    this.currency = currency;
  }

}
