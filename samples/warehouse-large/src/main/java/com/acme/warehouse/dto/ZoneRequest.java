package com.acme.warehouse.dto;

import javax.validation.constraints.*;

public class ZoneRequest {

  @NotBlank
  @Size(max = 12)
  private String code;

  @NotBlank
  @Size(max = 80)
  private String name;

  @NotNull
  @Positive
  private Long warehouseId;

  @NotNull
  @Min(-40)
  @Max(40)
  private Integer temperatureCelsius;

  public ZoneRequest() {
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
