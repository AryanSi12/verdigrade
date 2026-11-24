package com.acme.warehouse.dto;

import javax.validation.constraints.*;

public class WarehouseRequest {

  @NotBlank
  @Pattern(regexp = "[A-Z0-9-]+")
  @Size(max = 12)
  private String code;

  @NotBlank
  @Size(max = 120)
  private String name;

  @NotBlank
  @Size(max = 80)
  private String city;

  @NotNull
  @Min(1)
  private Integer capacity;

  public WarehouseRequest() {
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

  public String getCity() {
    return city;
  }

  public void setCity(String city) {
    this.city = city;
  }

  public Integer getCapacity() {
    return capacity;
  }

  public void setCapacity(Integer capacity) {
    this.capacity = capacity;
  }

}
