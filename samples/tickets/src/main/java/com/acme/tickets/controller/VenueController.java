package com.acme.tickets.controller;

import java.util.List;
import com.acme.tickets.dto.VenueRequest;
import com.acme.tickets.dto.VenueResponse;
import com.acme.tickets.service.VenueService;
import javax.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/venues")
public class VenueController {

  private final VenueService venueService;

  public VenueController(VenueService venueService) {
    this.venueService = venueService;
  }

  @GetMapping
  public List<VenueResponse> list() {
    return venueService.list();
  }

  @GetMapping("/{id}")
  public VenueResponse get(@PathVariable("id") Long id) {
    return venueService.get(id);
  }

  @PostMapping
  public ResponseEntity<VenueResponse> create(@Valid @RequestBody VenueRequest request) {
    return ResponseEntity.status(HttpStatus.CREATED).body(venueService.create(request));
  }

  @DeleteMapping("/{id}")
  public ResponseEntity<Void> delete(@PathVariable("id") Long id) {
    venueService.delete(id);
    return ResponseEntity.noContent().build();
  }
}
