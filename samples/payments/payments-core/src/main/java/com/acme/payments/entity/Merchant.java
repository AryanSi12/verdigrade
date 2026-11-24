package com.acme.payments.entity;

import javax.persistence.*;

@Entity
@Table(name = "merchants")
public class Merchant extends BaseEntity {

  @Column(nullable = false, length = 120, unique = true)
  private String name;

  @Column(nullable = false, length = 160)
  private String email;

  @Column(nullable = false, length = 2)
  private String countryCode;

  public Merchant() {
  }

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public String getEmail() {
    return email;
  }

  public void setEmail(String email) {
    this.email = email;
  }

  public String getCountryCode() {
    return countryCode;
  }

  public void setCountryCode(String countryCode) {
    this.countryCode = countryCode;
  }

}
