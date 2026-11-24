package com.acme.tickets.entity;

import javax.persistence.*;

@Entity
@Table(name = "tickets")
public class Ticket extends BaseEntity {

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  private TicketOrder ticketOrder;

  @Column(nullable = false, unique = true, length = 40)
  private String code;

  public Ticket() {
  }

  public TicketOrder getTicketOrder() {
    return ticketOrder;
  }

  public void setTicketOrder(TicketOrder ticketOrder) {
    this.ticketOrder = ticketOrder;
  }

  public String getCode() {
    return code;
  }

  public void setCode(String code) {
    this.code = code;
  }

}
