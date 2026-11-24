package com.acme.warehouse.dto;

import javax.validation.constraints.*;

public class CustomerRequest {

  @NotBlank
  @Email
  @Size(max = 160)
  private String email;

  @NotBlank
  @Size(max = 120)
  private String name;

  @NotNull
  @PositiveOrZero
  private Integer loyaltyPoints;

  public CustomerRequest() {
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
