package com.acme.warehouse.entity;

import javax.persistence.*;

@Entity
@Table(name = "zones")
public class Zone extends BaseEntity {

  @Column(nullable = false, length = 12, unique = true)
  private String code;

  @Column(nullable = false, length = 80)
  private String name;

  @Column(nullable = false)
  private Long warehouseId;

  private Integer temperatureCelsius;

  public Zone() {
  }

  public String getCode() {
    return code;
  }

  public void setCode(String code) {
    this.code = code;
  }

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public Long getWarehouseId() {
    return warehouseId;
  }

  public void setWarehouseId(Long warehouseId) {
    this.warehouseId = warehouseId;
  }

  public Integer getTemperatureCelsius() {
    return temperatureCelsius;
  }

  public void setTemperatureCelsius(Integer temperatureCelsius) {
    this.temperatureCelsius = temperatureCelsius;
  }

}
