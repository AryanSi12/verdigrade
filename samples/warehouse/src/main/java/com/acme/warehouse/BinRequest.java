package com.acme.warehouse;

import javax.validation.constraints.NotBlank;

public class BinRequest {

  @NotBlank
  private String sku;

  public String getSku() {
    return sku;
  }

  public void setSku(String sku) {
    this.sku = sku;
  }
}
