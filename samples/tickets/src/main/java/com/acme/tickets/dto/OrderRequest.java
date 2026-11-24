package com.acme.tickets.dto;

import javax.validation.constraints.*;

public class OrderRequest {

  @NotNull
  private Long eventId;

  @NotNull
  private Long customerId;

  @Min(1)
  private int quantity;

  public OrderRequest() {
  }

  public Long getEventId() {
    return eventId;
  }

  public void setEventId(Long eventId) {
    this.eventId = eventId;
  }

  public Long getCustomerId() {
    return customerId;
  }

  public void setCustomerId(Long customerId) {
    this.customerId = customerId;
  }

  public int getQuantity() {
    return quantity;
  }

  public void setQuantity(int quantity) {
    this.quantity = quantity;
  }

}
