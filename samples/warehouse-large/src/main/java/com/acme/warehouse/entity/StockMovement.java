package com.acme.warehouse.entity;

import javax.persistence.*;

@Entity
@Table(name = "stock_movements")
public class StockMovement extends BaseEntity {

  @Column(nullable = false, length = 24, unique = true)
  private String reference;

  @Column(nullable = false)
  private Long productId;

  @Column(nullable = false)
  private Integer quantity;

  @Column(nullable = false, length = 8)
  private String kind;

  public StockMovement() {
  }

  public String getReference() {
    return reference;
  }

  public void setReference(String reference) {
    this.reference = reference;
  }

  public Long getProductId() {
    return productId;
  }

  public void setProductId(Long productId) {
    this.productId = productId;
  }

  public Integer getQuantity() {
    return quantity;
  }

  public void setQuantity(Integer quantity) {
    this.quantity = quantity;
  }

  public String getKind() {
    return kind;
  }

  public void setKind(String kind) {
    this.kind = kind;
  }

}
