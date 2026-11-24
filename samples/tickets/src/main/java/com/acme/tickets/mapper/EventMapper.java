package com.acme.tickets.mapper;

import com.acme.tickets.dto.EventResponse;
import com.acme.tickets.entity.Event;

public final class EventMapper {

  private EventMapper() {
  }

  public static EventResponse toResponse(Event entity) {
    EventResponse response = new EventResponse();
    response.setId(entity.getId());
    response.setTitle(entity.getTitle());
    response.setDescription(entity.getDescription());
    response.setStartsAt(entity.getStartsAt());
    response.setVenueId(entity.getVenue().getId());
    response.setVenueName(entity.getVenue().getName());
    response.setCity(entity.getVenue().getCity());
    response.setTicketPrice(entity.getTicketPrice());
    response.setCapacity(entity.getCapacity());
    response.setTicketsLeft(entity.ticketsLeft());
    response.setStatus(entity.getStatus().name());
    return response;
  }
}
