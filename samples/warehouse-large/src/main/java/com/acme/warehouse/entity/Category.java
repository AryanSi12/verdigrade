package com.acme.warehouse.entity;

import javax.persistence.*;

@Entity
@Table(name = "categories")
public class Category extends BaseEntity {

  @Column(nullable = false, length = 80, unique = true)
  private String name;

  @Column(length = 400)
  private String description;

  public Category() {
  }

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public String getDescription() {
    return description;
  }

  public void setDescription(String description) {
    this.description = description;
  }

}
