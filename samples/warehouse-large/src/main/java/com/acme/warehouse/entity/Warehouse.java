package com.acme.warehouse.entity;

import javax.persistence.*;

@Entity
@Table(name = "warehouses")
public class Warehouse extends BaseEntity {

  @Column(nullable = false, length = 12, unique = true)
  private String code;

  @Column(nullable = false, length = 120)
  private String name;

  @Column(nullable = false, length = 80)
  private String city;

  private Integer capacity;

  public Warehouse() {
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
