package com.acme.library.dto;

import java.time.LocalDate;

public class LoanResponse {

  private Long id;

  private Long bookId;

  private String bookTitle;

  private Long memberId;

  private String memberName;

  private LocalDate loanedOn;

  private LocalDate dueOn;

  private LocalDate returnedOn;

  private String status;

  public LoanResponse() {
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

  public String getMemberName() {
    return memberName;
  }

  public void setMemberName(String memberName) {
    this.memberName = memberName;
  }

  public LocalDate getLoanedOn() {
    return loanedOn;
  }

  public void setLoanedOn(LocalDate loanedOn) {
    this.loanedOn = loanedOn;
  }

  public LocalDate getDueOn() {
    return dueOn;
  }

  public void setDueOn(LocalDate dueOn) {
    this.dueOn = dueOn;
  }

  public LocalDate getReturnedOn() {
    return returnedOn;
  }

  public void setReturnedOn(LocalDate returnedOn) {
    this.returnedOn = returnedOn;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }

}
