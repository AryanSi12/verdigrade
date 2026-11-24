package com.acme.warehouse.dto;

import javax.validation.constraints.*;

public class CarrierRequest {

  @NotBlank
  @Size(max = 100)
  private String name;

  @NotBlank
  @Size(min = 2, max = 4)
  private String scacCode;

  public CarrierRequest() {
  }

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public String getScacCode() {
    return scacCode;
  }

  public void setScacCode(String scacCode) {
    this.scacCode = scacCode;
  }

}
