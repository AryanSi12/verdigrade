package com.acme.shipping;

import javax.validation.constraints.NotBlank;

public class ShipmentRequest {

  @NotBlank
  private String tracking;

  public String getTracking() {
    return tracking;
  }

  public void setTracking(String tracking) {
    this.tracking = tracking;
  }
}
