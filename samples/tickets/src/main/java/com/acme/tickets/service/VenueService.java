package com.acme.tickets.service;

import java.util.List;
import java.util.stream.Collectors;
import com.acme.tickets.dto.VenueRequest;
import com.acme.tickets.dto.VenueResponse;
import com.acme.tickets.entity.Venue;
import com.acme.tickets.exception.BusinessRuleException;
import com.acme.tickets.exception.DuplicateResourceException;
import com.acme.tickets.exception.ResourceNotFoundException;
import com.acme.tickets.mapper.VenueMapper;
import com.acme.tickets.repository.EventRepository;
import com.acme.tickets.repository.VenueRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class VenueService {

  private final VenueRepository venues;
  private final EventRepository events;

  public VenueService(VenueRepository venues, EventRepository events) {
    this.venues = venues;
    this.events = events;
  }

  @Transactional(readOnly = true)
  public List<VenueResponse> list() {
    return venues.findAll().stream().map(VenueMapper::toResponse).collect(Collectors.toList());
  }

  @Transactional(readOnly = true)
  public VenueResponse get(Long id) {
    return VenueMapper.toResponse(find(id));
  }

  public VenueResponse create(VenueRequest request) {
    if (venues.existsByNameIgnoreCaseAndCity(request.getName(), request.getCity())) {
      throw new DuplicateResourceException("Venue " + request.getName() + " already exists in " + request.getCity());
    }
    Venue venue = new Venue();
    venue.setName(request.getName());
    venue.setCity(request.getCity());
    venue.setCapacity(request.getCapacity());
    return VenueMapper.toResponse(venues.save(venue));
  }

  public void delete(Long id) {
    Venue venue = find(id);
    if (events.countByVenueId(id) > 0) {
      throw new BusinessRuleException("Venue still has events");
    }
    venues.delete(venue);
  }

  public Venue find(Long id) {
    return venues.findById(id).orElseThrow(() -> new ResourceNotFoundException("Venue", id));
  }
}
