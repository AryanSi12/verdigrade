package com.acme.warehouse.entity;

import javax.persistence.*;

@Entity
@Table(name = "suppliers")
public class Supplier extends BaseEntity {

  @Column(nullable = false, length = 120, unique = true)
  private String name;

  @Column(nullable = false, length = 160)
  private String email;

  @Column(length = 20)
  private String phone;

  private Integer rating;

  public Supplier() {
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

  public String getPhone() {
    return phone;
  }

  public void setPhone(String phone) {
    this.phone = phone;
  }

  public Integer getRating() {
    return rating;
  }

  public void setRating(Integer rating) {
    this.rating = rating;
  }

}
