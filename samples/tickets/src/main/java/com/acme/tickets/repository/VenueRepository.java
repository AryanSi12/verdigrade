package com.acme.tickets.repository;

import com.acme.tickets.entity.Venue;
import org.springframework.data.jpa.repository.JpaRepository;

public interface VenueRepository extends JpaRepository<Venue, Long> {

  boolean existsByNameIgnoreCaseAndCity(String name, String city);
}
