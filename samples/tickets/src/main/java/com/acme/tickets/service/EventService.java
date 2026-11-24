package com.acme.tickets.service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;
import com.acme.tickets.dto.EventRequest;
import com.acme.tickets.dto.EventResponse;
import com.acme.tickets.entity.Event;
import com.acme.tickets.entity.EventStatus;
import com.acme.tickets.entity.Venue;
import com.acme.tickets.exception.BusinessRuleException;
import com.acme.tickets.exception.ResourceNotFoundException;
import com.acme.tickets.mapper.EventMapper;
import com.acme.tickets.repository.EventRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class EventService {

  private final EventRepository events;
  private final VenueService venueService;

  public EventService(EventRepository events, VenueService venueService) {
    this.events = events;
    this.venueService = venueService;
  }

  @Transactional(readOnly = true)
  public List<EventResponse> list(String city, boolean onlyOnSale) {
    List<Event> found;
    if (city != null && !city.trim().isEmpty()) {
      found = events.findByVenueCityIgnoreCaseOrderByStartsAt(city.trim());
    } else if (onlyOnSale) {
      found = events.findByStatusAndStartsAtAfterOrderByStartsAt(EventStatus.ON_SALE, LocalDateTime.now());
    } else {
      found = events.findAll();
    }
    return found.stream().map(EventMapper::toResponse).collect(Collectors.toList());
  }

  @Transactional(readOnly = true)
  public EventResponse get(Long id) {
    return EventMapper.toResponse(find(id));
  }

  public EventResponse create(EventRequest request) {
    Venue venue = venueService.find(request.getVenueId());
    if (request.getCapacity() > venue.getCapacity()) {
      throw new BusinessRuleException("Capacity " + request.getCapacity() + " is more than the venue holds (" + venue.getCapacity() + ")");
    }
    Event event = new Event();
    event.setTitle(request.getTitle());
    event.setDescription(request.getDescription());
    event.setStartsAt(request.getStartsAt());
    event.setVenue(venue);
    event.setTicketPrice(request.getTicketPrice());
    event.setCapacity(request.getCapacity());
    event.setStatus(EventStatus.DRAFT);
    return EventMapper.toResponse(events.save(event));
  }

  public EventResponse publish(Long id) {
    Event event = find(id);
    if (event.getStatus() != EventStatus.DRAFT) {
      throw new BusinessRuleException("Only draft events can be published");
    }
    event.setStatus(EventStatus.ON_SALE);
    return EventMapper.toResponse(events.save(event));
  }

  public EventResponse cancel(Long id) {
    Event event = find(id);
    if (event.getStatus() == EventStatus.CANCELLED) {
      throw new BusinessRuleException("Event is already cancelled");
    }
    event.setStatus(EventStatus.CANCELLED);
    return EventMapper.toResponse(events.save(event));
  }

  public Event find(Long id) {
    return events.findById(id).orElseThrow(() -> new ResourceNotFoundException("Event", id));
  }
}
