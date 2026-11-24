package com.acme.tickets.repository;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import com.acme.tickets.entity.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import static org.junit.jupiter.api.Assertions.*;

@DataJpaTest
class EventRepositoryTest {

  @Autowired private TestEntityManager em;
  @Autowired private EventRepository events;

  private Venue venue(String name, String city) {
    Venue venue = new Venue();
    venue.setName(name);
    venue.setCity(city);
    venue.setCapacity(500);
    return em.persist(venue);
  }

  private Event event(String title, Venue venue, int daysAhead, EventStatus status) {
    Event event = new Event();
    event.setTitle(title);
    event.setVenue(venue);
    event.setStartsAt(LocalDateTime.now().plusDays(daysAhead));
    event.setTicketPrice(new BigDecimal("10.00"));
    event.setCapacity(100);
    event.setStatus(status);
    return em.persist(event);
  }

  @Test
  void findsEventsByCityOrderedByStart() {
    Venue pune = venue("Hall", "Pune");
    Venue goa = venue("Beach", "Goa");
    event("Later", pune, 20, EventStatus.ON_SALE);
    event("Sooner", pune, 5, EventStatus.ON_SALE);
    event("Elsewhere", goa, 1, EventStatus.ON_SALE);
    List<Event> found = events.findByVenueCityIgnoreCaseOrderByStartsAt("PUNE");
    assertEquals(2, found.size());
    assertEquals("Sooner", found.get(0).getTitle());
  }

  @Test
  void onSaleQueryIgnoresDraftsAndPastEvents() {
    Venue hall = venue("Hall", "Pune");
    event("Live", hall, 3, EventStatus.ON_SALE);
    event("Draft", hall, 3, EventStatus.DRAFT);
    event("Past", hall, -3, EventStatus.ON_SALE);
    List<Event> found = events.findByStatusAndStartsAtAfterOrderByStartsAt(EventStatus.ON_SALE, LocalDateTime.now());
    assertEquals(1, found.size());
    assertEquals("Live", found.get(0).getTitle());
  }

  @Test
  void countsEventsPerVenue() {
    Venue hall = venue("Hall", "Pune");
    event("One", hall, 3, EventStatus.DRAFT);
    event("Two", hall, 4, EventStatus.DRAFT);
    assertEquals(2, events.countByVenueId(hall.getId()));
  }

  @Test
  void createdAtIsFilledOnPersist() {
    Event saved = event("Audited", venue("Hall", "Pune"), 2, EventStatus.DRAFT);
    assertNotNull(saved.getCreatedAt());
    assertNotNull(saved.getVersion());
  }
}
