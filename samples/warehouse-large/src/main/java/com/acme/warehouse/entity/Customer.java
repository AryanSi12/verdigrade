package com.acme.warehouse.entity;

import javax.persistence.*;

@Entity
@Table(name = "customers")
public class Customer extends BaseEntity {

  @Column(nullable = false, unique = true, length = 160)
  private String email;

  @Column(nullable = false, length = 120)
  private String name;

  @Column(nullable = false)
  private Integer loyaltyPoints;

  public Customer() {
  }

  public String getEmail() {
    return email;
  }

  public void setEmail(String email) {
    this.email = email;
  }

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public Integer getLoyaltyPoints() {
    return loyaltyPoints;
  }

  public void setLoyaltyPoints(Integer loyaltyPoints) {
    this.loyaltyPoints = loyaltyPoints;
  }

}
