package com.acme.warehouse.dto;


public class ZoneResponse {

  private Long id;

  private String code;

  private String name;

  private Long warehouseId;

  private Integer temperatureCelsius;

  public ZoneResponse() {
  }

  public Long getId() {
    return id;
  }

  public void setId(Long id) {
    this.id = id;
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
