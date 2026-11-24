package com.acme.library.dto;

import javax.validation.constraints.*;
import com.acme.library.validation.ValidIsbn;

public class BookRequest {

  @NotBlank
  @Size(max = 200)
  private String title;

  @NotBlank
  @ValidIsbn
  private String isbn;

  @Min(1450)
  @Max(2100)
  private int publishedYear;

  @NotNull
  private String genre;

  @Min(1)
  @Max(500)
  private int copies;

  @NotNull
  private Long authorId;

  public BookRequest() {
  }

  public String getTitle() {
    return title;
  }

  public void setTitle(String title) {
    this.title = title;
  }

  public String getIsbn() {
    return isbn;
  }

  public void setIsbn(String isbn) {
    this.isbn = isbn;
  }

  public int getPublishedYear() {
    return publishedYear;
  }

  public void setPublishedYear(int publishedYear) {
    this.publishedYear = publishedYear;
  }

  public String getGenre() {
    return genre;
  }

  public void setGenre(String genre) {
    this.genre = genre;
  }

  public int getCopies() {
    return copies;
  }

  public void setCopies(int copies) {
    this.copies = copies;
  }

  public Long getAuthorId() {
    return authorId;
  }

  public void setAuthorId(Long authorId) {
    this.authorId = authorId;
  }

}
