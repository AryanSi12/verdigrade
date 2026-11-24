package com.acme.tickets.config;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import com.acme.tickets.entity.*;
import com.acme.tickets.repository.CustomerRepository;
import com.acme.tickets.repository.EventRepository;
import com.acme.tickets.repository.VenueRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

/** Seeds two venues, three events and a customer so the API has something to show. */
@Component
public class DataLoader implements CommandLineRunner {

  private final VenueRepository venues;
  private final EventRepository events;
  private final CustomerRepository customers;

  public DataLoader(VenueRepository venues, EventRepository events, CustomerRepository customers) {
    this.venues = venues;
    this.events = events;
    this.customers = customers;
  }

  @Override
  public void run(String... args) {
    if (venues.count() > 0) {
      return;
    }
    Venue hall = venue("Riverside Hall", "Pune", 500);
    Venue arena = venue("Harbour Arena", "Mumbai", 2000);
    event("Jazz Night", hall, LocalDateTime.now().plusDays(10), "25.00", 200, EventStatus.ON_SALE);
    event("Indie Rock Festival", arena, LocalDateTime.now().plusDays(30), "60.00", 1500, EventStatus.ON_SALE);
    event("Stand-up Special", hall, LocalDateTime.now().plusDays(45), "18.50", 300, EventStatus.DRAFT);
    Customer customer = new Customer();
    customer.setName("Demo Customer");
    customer.setEmail("demo@tickets.example");
    customers.save(customer);
  }

  private Venue venue(String name, String city, int capacity) {
    Venue venue = new Venue();
    venue.setName(name);
    venue.setCity(city);
    venue.setCapacity(capacity);
    return venues.save(venue);
  }

  private void event(String title, Venue venue, LocalDateTime startsAt, String price, int capacity, EventStatus status) {
    Event event = new Event();
    event.setTitle(title);
    event.setVenue(venue);
    event.setStartsAt(startsAt);
    event.setTicketPrice(new BigDecimal(price));
    event.setCapacity(capacity);
    event.setStatus(status);
    events.save(event);
  }
}
