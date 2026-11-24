package com.acme.warehouse.dto;

import java.math.BigDecimal;
import javax.validation.constraints.*;

public class ProductRequest {

  @NotBlank
  @Pattern(regexp = "[A-Z0-9-]+")
  @Size(max = 20)
  private String sku;

  @NotBlank
  @Size(max = 160)
  private String name;

  @NotNull
  @Positive
  private Long categoryId;

  @NotNull
  @DecimalMin("0.01")
  @Digits(integer = 8, fraction = 2)
  private BigDecimal unitPrice;

  @NotNull
  @PositiveOrZero
  private Integer reorderLevel;

  public ProductRequest() {
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
