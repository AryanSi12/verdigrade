package com.acme.tickets.service;

import java.util.Optional;
import com.acme.tickets.dto.VenueRequest;
import com.acme.tickets.entity.Venue;
import com.acme.tickets.exception.BusinessRuleException;
import com.acme.tickets.exception.DuplicateResourceException;
import com.acme.tickets.exception.ResourceNotFoundException;
import com.acme.tickets.repository.EventRepository;
import com.acme.tickets.repository.VenueRepository;
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
class VenueServiceTest {

  @Mock private VenueRepository venues;
  @Mock private EventRepository events;
  @InjectMocks private VenueService service;

  private VenueRequest request() {
    VenueRequest request = new VenueRequest();
    request.setName("Town Hall");
    request.setCity("Pune");
    request.setCapacity(300);
    return request;
  }

  @Test
  void createSavesTheVenue() {
    when(venues.save(any(Venue.class))).then(AdditionalAnswers.returnsFirstArg());
    assertEquals("Town Hall", service.create(request()).getName());
  }

  @Test
  void createRejectsDuplicates() {
    when(venues.existsByNameIgnoreCaseAndCity("Town Hall", "Pune")).thenReturn(true);
    assertThrows(DuplicateResourceException.class, () -> service.create(request()));
    verify(venues, never()).save(any(Venue.class));
  }

  @Test
  void deleteRefusesVenuesWithEvents() {
    when(venues.findById(1L)).thenReturn(Optional.of(new Venue()));
    when(events.countByVenueId(1L)).thenReturn(2L);
    assertThrows(BusinessRuleException.class, () -> service.delete(1L));
  }

  @Test
  void missingVenueIsNotFound() {
    when(venues.findById(9L)).thenReturn(Optional.empty());
    assertThrows(ResourceNotFoundException.class, () -> service.get(9L));
  }
}
