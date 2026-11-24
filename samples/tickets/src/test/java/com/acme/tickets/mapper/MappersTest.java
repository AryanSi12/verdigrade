package com.acme.tickets.mapper;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import com.acme.tickets.entity.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;

class MappersTest {

  private Event event() {
    Venue venue = new Venue();
    venue.setId(1L);
    venue.setName("Hall");
    venue.setCity("Pune");
    Event event = new Event();
    event.setId(2L);
    event.setTitle("Concert");
    event.setVenue(venue);
    event.setCapacity(100);
    event.setTicketsSold(40);
    event.setTicketPrice(new BigDecimal("12.00"));
    event.setStartsAt(LocalDateTime.of(2030, 1, 1, 20, 0));
    event.setStatus(EventStatus.ON_SALE);
    return event;
  }

  @Test
  void eventMapperComputesTicketsLeftAndCopiesTheVenue() {
    assertEquals(60, EventMapper.toResponse(event()).getTicketsLeft());
    assertEquals("Pune", EventMapper.toResponse(event()).getCity());
    assertEquals("ON_SALE", EventMapper.toResponse(event()).getStatus());
  }

  @Test
  void ticketMapperReachesTheEventTitleThroughTheOrder() {
    TicketOrder order = new TicketOrder();
    order.setId(5L);
    order.setEvent(event());
    Ticket ticket = new Ticket();
    ticket.setTicketOrder(order);
    ticket.setCode("TKT-2-ABC");
    assertEquals("Concert", TicketMapper.toResponse(ticket).getEventTitle());
    assertEquals(Long.valueOf(5L), TicketMapper.toResponse(ticket).getOrderId());
  }
}
