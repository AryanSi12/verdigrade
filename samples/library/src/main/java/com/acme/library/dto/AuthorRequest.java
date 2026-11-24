package com.acme.library.dto;

import javax.validation.constraints.*;

public class AuthorRequest {

  @NotBlank
  @Size(max = 160)
  private String name;

  @Size(max = 4000)
  private String biography;

  @Min(1000)
  @Max(2100)
  private Integer birthYear;

  public AuthorRequest() {
  }

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public String getBiography() {
    return biography;
  }

  public void setBiography(String biography) {
    this.biography = biography;
  }

  public Integer getBirthYear() {
    return birthYear;
  }

  public void setBirthYear(Integer birthYear) {
    this.birthYear = birthYear;
  }

}
