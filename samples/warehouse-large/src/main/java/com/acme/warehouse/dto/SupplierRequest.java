package com.acme.warehouse.dto;

import javax.validation.constraints.*;

public class SupplierRequest {

  @NotBlank
  @Size(max = 120)
  private String name;

  @NotBlank
  @Email
  @Size(max = 160)
  private String email;

  @Pattern(regexp = "\\+?[0-9 ()-]{7,20}")
  private String phone;

  @NotNull
  @Min(1)
  @Max(5)
  private Integer rating;

  public SupplierRequest() {
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
