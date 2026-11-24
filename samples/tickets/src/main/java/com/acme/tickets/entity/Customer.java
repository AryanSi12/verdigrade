package com.acme.tickets.entity;

import javax.persistence.*;

@Entity
@Table(name = "customers")
public class Customer extends BaseEntity {

  @Column(nullable = false, length = 120)
  private String name;

  @Column(nullable = false, unique = true, length = 160)
  private String email;

  public Customer() {
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

}
