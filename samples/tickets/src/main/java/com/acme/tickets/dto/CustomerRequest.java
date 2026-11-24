package com.acme.tickets.dto;

import javax.validation.constraints.*;

public class CustomerRequest {

  @NotBlank
  @Size(max = 120)
  private String name;

  @NotBlank
  @Email
  private String email;

  public CustomerRequest() {
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
