package com.acme.tickets.mapper;

import com.acme.tickets.dto.OrderResponse;
import com.acme.tickets.entity.TicketOrder;

public final class OrderMapper {

  private OrderMapper() {
  }

  public static OrderResponse toResponse(TicketOrder entity) {
    OrderResponse response = new OrderResponse();
    response.setId(entity.getId());
    response.setEventId(entity.getEvent().getId());
    response.setEventTitle(entity.getEvent().getTitle());
    response.setCustomerId(entity.getCustomer().getId());
    response.setQuantity(entity.getQuantity());
    response.setTotal(entity.getTotal());
    response.setStatus(entity.getStatus().name());
    response.setCreatedAt(entity.getCreatedAt());
    return response;
  }
}
