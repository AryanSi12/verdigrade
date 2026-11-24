package com.acme.tickets.dto;

import javax.validation.constraints.*;

public class VenueRequest {

  @NotBlank
  @Size(max = 160)
  private String name;

  @NotBlank
  @Size(max = 80)
  private String city;

  @Min(1)
  private int capacity;

  public VenueRequest() {
  }

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public String getCity() {
    return city;
  }

  public void setCity(String city) {
    this.city = city;
  }

  public int getCapacity() {
    return capacity;
  }

  public void setCapacity(int capacity) {
    this.capacity = capacity;
  }

}
