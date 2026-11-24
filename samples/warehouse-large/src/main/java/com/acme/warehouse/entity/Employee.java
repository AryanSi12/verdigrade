package com.acme.warehouse.entity;

import javax.persistence.*;
import java.time.LocalDate;

@Entity
@Table(name = "employees")
public class Employee extends BaseEntity {

  @Column(nullable = false, length = 12, unique = true)
  private String badge;

  @Column(nullable = false, length = 120)
  private String name;

  @Column(nullable = false)
  private LocalDate hiredOn;

  @Column(nullable = false)
  private Boolean active;

  public Employee() {
  }

  public String getBadge() {
    return badge;
  }

  public void setBadge(String badge) {
    this.badge = badge;
  }

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public LocalDate getHiredOn() {
    return hiredOn;
  }

  public void setHiredOn(LocalDate hiredOn) {
    this.hiredOn = hiredOn;
  }

  public Boolean getActive() {
    return active;
  }

  public void setActive(Boolean active) {
    this.active = active;
  }

}
