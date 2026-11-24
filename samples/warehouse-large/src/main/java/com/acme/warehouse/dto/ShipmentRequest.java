package com.acme.warehouse.dto;

import java.time.LocalDate;
import javax.validation.constraints.*;

public class ShipmentRequest {

  @NotBlank
  @Size(max = 30)
  private String trackingCode;

  @NotNull
  @Positive
  private Long carrierId;

  @NotBlank
  @Size(max = 160)
  private String destination;

  @NotNull
  @PastOrPresent
  private LocalDate shippedOn;

  public ShipmentRequest() {
  }

  public String getTrackingCode() {
    return trackingCode;
  }

  public void setTrackingCode(String trackingCode) {
    this.trackingCode = trackingCode;
  }

  public Long getCarrierId() {
    return carrierId;
  }

  public void setCarrierId(Long carrierId) {
    this.carrierId = carrierId;
  }

  public String getDestination() {
    return destination;
  }

  public void setDestination(String destination) {
    this.destination = destination;
  }

  public LocalDate getShippedOn() {
    return shippedOn;
  }

  public void setShippedOn(LocalDate shippedOn) {
    this.shippedOn = shippedOn;
  }

}
