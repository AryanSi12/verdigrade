package com.acme.warehouse.entity;

import javax.persistence.*;
import java.time.LocalDate;

@Entity
@Table(name = "shipments")
public class Shipment extends BaseEntity {

  @Column(nullable = false, length = 30, unique = true)
  private String trackingCode;

  @Column(nullable = false)
  private Long carrierId;

  @Column(nullable = false, length = 160)
  private String destination;

  @Column(nullable = false)
  private LocalDate shippedOn;

  public Shipment() {
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
