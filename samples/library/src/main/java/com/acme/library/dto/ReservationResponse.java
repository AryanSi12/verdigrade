package com.acme.library.dto;

import java.util.Date;

public class ReservationResponse {

  private Long id;

  private Long bookId;

  private String bookTitle;

  private Long memberId;

  private Date reservedAt;

  private Date expiresAt;

  private String status;

  public ReservationResponse() {
  }

  public Long getId() {
    return id;
  }

  public void setId(Long id) {
    this.id = id;
  }

  public Long getBookId() {
    return bookId;
  }

  public void setBookId(Long bookId) {
    this.bookId = bookId;
  }

  public String getBookTitle() {
    return bookTitle;
  }

  public void setBookTitle(String bookTitle) {
    this.bookTitle = bookTitle;
  }

  public Long getMemberId() {
    return memberId;
  }

  public void setMemberId(Long memberId) {
    this.memberId = memberId;
  }

  public Date getReservedAt() {
    return reservedAt;
  }

  public void setReservedAt(Date reservedAt) {
    this.reservedAt = reservedAt;
  }

  public Date getExpiresAt() {
    return expiresAt;
  }

  public void setExpiresAt(Date expiresAt) {
    this.expiresAt = expiresAt;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }

}
