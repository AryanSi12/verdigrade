package com.acme.warehouse.entity;

import javax.persistence.*;
import java.time.LocalDate;

@Entity
@Table(name = "purchase_orders")
public class PurchaseOrder extends BaseEntity {

  @Column(nullable = false, length = 24, unique = true)
  private String orderNumber;

  @Column(nullable = false)
  private Long supplierId;

  @Column(nullable = false)
  private LocalDate expectedOn;

  @Column(nullable = false)
  private Integer quantity;

  public PurchaseOrder() {
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
