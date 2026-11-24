package com.acme.warehouse.dto;

import java.time.LocalDate;
import javax.validation.constraints.*;

public class EmployeeRequest {

  @NotBlank
  @Size(max = 12)
  private String badge;

  @NotBlank
  @Size(max = 120)
  private String name;

  @NotNull
  @Past
  private LocalDate hiredOn;

  @NotNull
  private Boolean active;

  public EmployeeRequest() {
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
