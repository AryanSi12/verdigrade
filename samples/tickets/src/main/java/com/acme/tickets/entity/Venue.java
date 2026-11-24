package com.acme.tickets.entity;

import javax.persistence.*;

@Entity
@Table(name = "venues")
public class Venue extends BaseEntity {

  @Column(nullable = false, length = 160)
  private String name;

  @Column(nullable = false, length = 80)
  private String city;

  private int capacity;

  public Venue() {
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

  public int getCapacity() {
    return capacity;
  }

  public void setCapacity(int capacity) {
    this.capacity = capacity;
  }

}
