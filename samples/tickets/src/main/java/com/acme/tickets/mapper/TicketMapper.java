package com.acme.tickets.mapper;

import com.acme.tickets.dto.TicketResponse;
import com.acme.tickets.entity.Ticket;

public final class TicketMapper {

  private TicketMapper() {
  }

  public static TicketResponse toResponse(Ticket entity) {
    TicketResponse response = new TicketResponse();
    response.setId(entity.getId());
    response.setOrderId(entity.getTicketOrder().getId());
    response.setCode(entity.getCode());
    response.setEventTitle(entity.getTicketOrder().getEvent().getTitle());
    return response;
  }
}
