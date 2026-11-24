package com.acme.library.dto;

import javax.validation.constraints.*;

public class LoanRequest {

  @NotNull
  private Long bookId;

  @NotNull
  private Long memberId;

  public LoanRequest() {
  }

  public Long getBookId() {
    return bookId;
  }

  public void setBookId(Long bookId) {
    this.bookId = bookId;
  }

  public Long getMemberId() {
    return memberId;
  }

  public void setMemberId(Long memberId) {
    this.memberId = memberId;
  }

}
