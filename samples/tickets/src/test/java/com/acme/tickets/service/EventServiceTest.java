package com.acme.tickets.service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Optional;
import com.acme.tickets.dto.EventRequest;
import com.acme.tickets.dto.EventResponse;
import com.acme.tickets.entity.Event;
import com.acme.tickets.entity.EventStatus;
import com.acme.tickets.entity.Venue;
import com.acme.tickets.exception.BusinessRuleException;
import com.acme.tickets.repository.EventRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.AdditionalAnswers;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class EventServiceTest {

  @Mock private EventRepository events;
  @Mock private VenueService venueService;
  @InjectMocks private EventService service;

  private Venue venue(int capacity) {
    Venue venue = new Venue();
    venue.setId(1L);
    venue.setName("Hall");
    venue.setCity("Pune");
    venue.setCapacity(capacity);
    return venue;
  }

  private EventRequest request(int capacity) {
    EventRequest request = new EventRequest();
    request.setTitle("Concert");
    request.setStartsAt(LocalDateTime.now().plusDays(5));
    request.setVenueId(1L);
    request.setTicketPrice(new BigDecimal("30.00"));
    request.setCapacity(capacity);
    return request;
  }

  private Event event(EventStatus status) {
    Event event = new Event();
    event.setTitle("Concert");
    event.setVenue(venue(100));
    event.setStatus(status);
    event.setCapacity(100);
    event.setTicketPrice(BigDecimal.TEN);
    return event;
  }

  @Test
  void createStartsAsDraft() {
    when(venueService.find(1L)).thenReturn(venue(100));
    when(events.save(any(Event.class))).then(AdditionalAnswers.returnsFirstArg());
    EventResponse response = service.create(request(80));
    assertEquals("DRAFT", response.getStatus());
    assertEquals(80, response.getTicketsLeft());
  }

  @Test
  void createRejectsMoreSeatsThanTheVenueHolds() {
    when(venueService.find(1L)).thenReturn(venue(50));
    assertThrows(BusinessRuleException.class, () -> service.create(request(80)));
  }

  @Test
  void publishMovesDraftToOnSale() {
    when(events.findById(3L)).thenReturn(Optional.of(event(EventStatus.DRAFT)));
    when(events.save(any(Event.class))).then(AdditionalAnswers.returnsFirstArg());
    assertEquals("ON_SALE", service.publish(3L).getStatus());
  }

  @Test
  void publishRejectsNonDrafts() {
    when(events.findById(3L)).thenReturn(Optional.of(event(EventStatus.ON_SALE)));
    assertThrows(BusinessRuleException.class, () -> service.publish(3L));
  }

  @Test
  void cancelTwiceIsRejected() {
    when(events.findById(3L)).thenReturn(Optional.of(event(EventStatus.CANCELLED)));
    assertThrows(BusinessRuleException.class, () -> service.cancel(3L));
  }
}
