package com.acme.warehouse.dto;

import java.time.LocalDate;

public class EmployeeResponse {

  private Long id;

  private String badge;

  private String name;

  private LocalDate hiredOn;

  private Boolean active;

  public EmployeeResponse() {
  }

  public Long getId() {
    return id;
  }

  public void setId(Long id) {
    this.id = id;
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
