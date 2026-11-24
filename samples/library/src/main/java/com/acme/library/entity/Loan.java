package com.acme.library.entity;

import javax.persistence.*;
import java.time.LocalDate;

@Entity
@Table(name = "loans")
public class Loan extends BaseEntity {

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  private Book book;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  private Member member;

  private LocalDate loanedOn;

  private LocalDate dueOn;

  private LocalDate returnedOn;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private LoanStatus status;

  public Loan() {
  }

  public Book getBook() {
    return book;
  }

  public void setBook(Book book) {
    this.book = book;
  }

  public Member getMember() {
    return member;
  }

  public void setMember(Member member) {
    this.member = member;
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

  public LoanStatus getStatus() {
    return status;
  }

  public void setStatus(LoanStatus status) {
    this.status = status;
  }

}
