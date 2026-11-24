package com.acme.library.entity;

import javax.persistence.*;

@Entity
@Table(name = "authors")
public class Author extends BaseEntity {

  @Column(nullable = false, unique = true, length = 160)
  private String name;

  @Lob
  private String biography;

  private Integer birthYear;

  public Author() {
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
