package com.acme.fleet;

import javax.validation.constraints.NotBlank;

public class VehicleRequest {

  @NotBlank
  private String plate;

  public String getPlate() {
    return plate;
  }

  public void setPlate(String plate) {
    this.plate = plate;
  }
}
