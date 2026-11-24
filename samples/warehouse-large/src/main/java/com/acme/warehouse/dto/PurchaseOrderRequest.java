package com.acme.warehouse.dto;

import java.time.LocalDate;
import javax.validation.constraints.*;

public class PurchaseOrderRequest {

  @NotBlank
  @Size(max = 24)
  private String orderNumber;

  @NotNull
  @Positive
  private Long supplierId;

  @NotNull
  @Future
  private LocalDate expectedOn;

  @NotNull
  @Positive
  private Integer quantity;

  public PurchaseOrderRequest() {
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
