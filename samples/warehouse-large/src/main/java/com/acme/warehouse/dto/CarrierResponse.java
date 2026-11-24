package com.acme.warehouse.dto;


public class CarrierResponse {

  private Long id;

  private String name;

  private String scacCode;

  public CarrierResponse() {
  }

  public Long getId() {
    return id;
  }

  public void setId(Long id) {
    this.id = id;
  }

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public String getScacCode() {
    return scacCode;
  }

  public void setScacCode(String scacCode) {
    this.scacCode = scacCode;
  }

}
