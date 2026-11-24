package com.acme.tickets.repository;

import com.acme.tickets.entity.Event;
import com.acme.tickets.entity.EventStatus;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EventRepository extends JpaRepository<Event, Long> {

  List<Event> findByVenueCityIgnoreCaseOrderByStartsAt(String city);

  List<Event> findByStatusAndStartsAtAfterOrderByStartsAt(EventStatus status, LocalDateTime after);

  long countByVenueId(Long venueId);
}
