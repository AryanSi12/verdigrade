package com.acme.reservations;

import javax.validation.constraints.NotBlank;

public class ReservationRequest {

  @NotBlank
  private String guest;

  public String getGuest() {
    return guest;
  }

  public void setGuest(String guest) {
    this.guest = guest;
  }
}
