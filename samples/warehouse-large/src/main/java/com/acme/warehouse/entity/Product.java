package com.acme.warehouse.entity;

import javax.persistence.*;
import java.math.BigDecimal;

@Entity
@Table(name = "products")
public class Product extends BaseEntity {

  @Column(nullable = false, length = 20, unique = true)
  private String sku;

  @Column(nullable = false, length = 160)
  private String name;

  @Column(nullable = false)
  private Long categoryId;

  @Column(nullable = false, precision = 10, scale = 2)
  private BigDecimal unitPrice;

  @Column(nullable = false)
  private Integer reorderLevel;

  public Product() {
  }

  public String getSku() {
    return sku;
  }

  public void setSku(String sku) {
    this.sku = sku;
  }

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public Long getCategoryId() {
    return categoryId;
  }

  public void setCategoryId(Long categoryId) {
    this.categoryId = categoryId;
  }

  public BigDecimal getUnitPrice() {
    return unitPrice;
  }

  public void setUnitPrice(BigDecimal unitPrice) {
    this.unitPrice = unitPrice;
  }

  public Integer getReorderLevel() {
    return reorderLevel;
  }

  public void setReorderLevel(Integer reorderLevel) {
    this.reorderLevel = reorderLevel;
  }

}
