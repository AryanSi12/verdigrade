package com.acme.library.entity;

import javax.persistence.*;
import java.util.Set;
import java.util.HashSet;

@Entity
@Table(name = "books")
public class Book extends BaseEntity {

  @Column(nullable = false, length = 200)
  private String title;

  @Column(nullable = false, unique = true, length = 20)
  private String isbn;

  private int publishedYear;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private Genre genre;

  private int copiesTotal;

  private int copiesAvailable;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "author_id")
  private Author author;

  public Book() {
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

  public Genre getGenre() {
    return genre;
  }

  public void setGenre(Genre genre) {
    this.genre = genre;
  }

  public int getCopiesTotal() {
    return copiesTotal;
  }

  public void setCopiesTotal(int copiesTotal) {
    this.copiesTotal = copiesTotal;
  }

  public int getCopiesAvailable() {
    return copiesAvailable;
  }

  public void setCopiesAvailable(int copiesAvailable) {
    this.copiesAvailable = copiesAvailable;
  }

  public Author getAuthor() {
    return author;
  }

  public void setAuthor(Author author) {
    this.author = author;
  }

}
