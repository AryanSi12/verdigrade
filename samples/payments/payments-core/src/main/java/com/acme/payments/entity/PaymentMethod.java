package com.acme.payments.entity;

import javax.persistence.*;

@Entity
@Table(name = "payment_methods")
public class PaymentMethod extends BaseEntity {

  @Column(nullable = false, length = 40, unique = true)
  private String token;

  @Column(nullable = false, length = 20)
  private String brand;

  @Column(nullable = false, length = 4)
  private String last4;

  @Column(nullable = false)
  private Integer expiryYear;

  public PaymentMethod() {
  }

  public String getToken() {
    return token;
  }

  public void setToken(String token) {
    this.token = token;
  }

  public String getBrand() {
    return brand;
  }

  public void setBrand(String brand) {
    this.brand = brand;
  }

  public String getLast4() {
    return last4;
  }

  public void setLast4(String last4) {
    this.last4 = last4;
  }

  public Integer getExpiryYear() {
    return expiryYear;
  }

  public void setExpiryYear(Integer expiryYear) {
    this.expiryYear = expiryYear;
  }

}
