package com.acme.warehouse.dto;

import javax.validation.constraints.*;

public class CategoryRequest {

  @NotBlank
  @Size(max = 80)
  private String name;

  @Size(max = 400)
  private String description;

  public CategoryRequest() {
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
