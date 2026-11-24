package com.acme.warehouse.dto;

import javax.validation.constraints.*;

public class StockMovementRequest {

  @NotBlank
  @Size(max = 24)
  private String reference;

  @NotNull
  @Positive
  private Long productId;

  @NotNull
  @Min(1)
  private Integer quantity;

  @NotBlank
  @Pattern(regexp = "IN|OUT|MOVE")
  @Size(max = 8)
  private String kind;

  public StockMovementRequest() {
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
