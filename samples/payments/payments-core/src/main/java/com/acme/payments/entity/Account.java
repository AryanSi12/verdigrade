package com.acme.payments.entity;

import javax.persistence.*;

@Entity
@Table(name = "accounts")
public class Account extends BaseEntity {

  @Column(nullable = false, length = 20, unique = true)
  private String accountNumber;

  @Column(nullable = false, length = 120)
  private String holderName;

  @Column(nullable = false, length = 3)
  private String currency;

  public Account() {
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
