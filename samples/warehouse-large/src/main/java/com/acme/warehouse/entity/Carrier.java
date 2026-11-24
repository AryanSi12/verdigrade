package com.acme.warehouse.entity;

import javax.persistence.*;

@Entity
@Table(name = "carriers")
public class Carrier extends BaseEntity {

  @Column(nullable = false, length = 100, unique = true)
  private String name;

  @Column(nullable = false, length = 4)
  private String scacCode;

  public Carrier() {
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
