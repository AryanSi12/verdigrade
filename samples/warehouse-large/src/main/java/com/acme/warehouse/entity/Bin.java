package com.acme.warehouse.entity;

import javax.persistence.*;
import java.math.BigDecimal;

@Entity
@Table(name = "bins")
public class Bin extends BaseEntity {

  @Column(nullable = false, length = 16, unique = true)
  private String label;

  @Column(nullable = false)
  private Long zoneId;

  @Column(nullable = false, precision = 10, scale = 2)
  private BigDecimal maxWeightKg;

  public Bin() {
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
