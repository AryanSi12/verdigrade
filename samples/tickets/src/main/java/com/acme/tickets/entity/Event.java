package com.acme.tickets.entity;

import javax.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "events")
public class Event extends BaseEntity {

  @Column(nullable = false, length = 200)
  private String title;

  @Column(length = 2000)
  private String description;

  @Column(nullable = false)
  private LocalDateTime startsAt;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  private Venue venue;

  @Column(nullable = false, precision = 10, scale = 2)
  private BigDecimal ticketPrice;

  private int capacity;

  private int ticketsSold;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private EventStatus status;

  public Event() {
  }

  public String getTitle() {
    return title;
  }

  public void setTitle(String title) {
    this.title = title;
  }

  public String getDescription() {
    return description;
  }

  public void setDescription(String description) {
    this.description = description;
  }

  public LocalDateTime getStartsAt() {
    return startsAt;
  }

  public void setStartsAt(LocalDateTime startsAt) {
    this.startsAt = startsAt;
  }

  public Venue getVenue() {
    return venue;
  }

  public void setVenue(Venue venue) {
    this.venue = venue;
  }

  public BigDecimal getTicketPrice() {
    return ticketPrice;
  }

  public void setTicketPrice(BigDecimal ticketPrice) {
    this.ticketPrice = ticketPrice;
  }

  public int getCapacity() {
    return capacity;
  }

  public void setCapacity(int capacity) {
    this.capacity = capacity;
  }

  public int getTicketsSold() {
    return ticketsSold;
  }

  public void setTicketsSold(int ticketsSold) {
    this.ticketsSold = ticketsSold;
  }

  public EventStatus getStatus() {
    return status;
  }

  public void setStatus(EventStatus status) {
    this.status = status;
  }

  public int ticketsLeft() {
    return capacity - ticketsSold;
  }

}
