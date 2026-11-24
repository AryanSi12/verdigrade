package com.acme.warehouse.dto;

import java.time.LocalDate;

public class ShipmentResponse {

  private Long id;

  private String trackingCode;

  private Long carrierId;

  private String destination;

  private LocalDate shippedOn;

  public ShipmentResponse() {
  }

  public Long getId() {
    return id;
  }

  public void setId(Long id) {
    this.id = id;
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
