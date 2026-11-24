package com.acme.warehouse.dto;

import java.time.LocalDate;

public class PurchaseOrderResponse {

  private Long id;

  private String orderNumber;

  private Long supplierId;

  private LocalDate expectedOn;

  private Integer quantity;

  public PurchaseOrderResponse() {
  }

  public Long getId() {
    return id;
  }

  public void setId(Long id) {
    this.id = id;
  }

  public String getOrderNumber() {
    return orderNumber;
  }

  public void setOrderNumber(String orderNumber) {
    this.orderNumber = orderNumber;
  }

  public Long getSupplierId() {
    return supplierId;
  }

  public void setSupplierId(Long supplierId) {
    this.supplierId = supplierId;
  }

  public LocalDate getExpectedOn() {
    return expectedOn;
  }

  public void setExpectedOn(LocalDate expectedOn) {
    this.expectedOn = expectedOn;
  }

  public Integer getQuantity() {
    return quantity;
  }

  public void setQuantity(Integer quantity) {
    this.quantity = quantity;
  }

}
