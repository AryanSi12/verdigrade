package com.acme.library.entity;

import javax.persistence.*;
import java.util.Date;

@Entity
@Table(name = "reservations")
public class Reservation extends BaseEntity {

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  private Book book;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  private Member member;

  @Temporal(TemporalType.TIMESTAMP)
  private Date reservedAt;

  @Temporal(TemporalType.TIMESTAMP)
  private Date expiresAt;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private ReservationStatus status;

  public Reservation() {
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

  public ReservationStatus getStatus() {
    return status;
  }

  public void setStatus(ReservationStatus status) {
    this.status = status;
  }

}
