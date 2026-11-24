package com.acme.warehouse.dto;

import java.math.BigDecimal;

public class BinResponse {

  private Long id;

  private String label;

  private Long zoneId;

  private BigDecimal maxWeightKg;

  public BinResponse() {
  }

  public Long getId() {
    return id;
  }

  public void setId(Long id) {
    this.id = id;
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
