package com.acme.warehouse.dto;

import java.math.BigDecimal;
import javax.validation.constraints.*;

public class BinRequest {

  @NotBlank
  @Size(max = 16)
  private String label;

  @NotNull
  @Positive
  private Long zoneId;

  @NotNull
  @DecimalMin("0.1")
  private BigDecimal maxWeightKg;

  public BinRequest() {
  }

  public String getLabel() {
    return label;
  }

  public void setLabel(String label) {
    this.label = label;
  }

  public Long getZoneId() {
    return zoneId;
  }

  public void setZoneId(Long zoneId) {
    this.zoneId = zoneId;
  }

  public BigDecimal getMaxWeightKg() {
    return maxWeightKg;
  }

  public void setMaxWeightKg(BigDecimal maxWeightKg) {
    this.maxWeightKg = maxWeightKg;
  }

}
