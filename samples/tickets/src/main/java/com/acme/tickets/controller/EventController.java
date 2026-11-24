package com.acme.tickets.controller;

import java.math.BigDecimal;
import java.util.List;
import com.acme.tickets.dto.EventRequest;
import com.acme.tickets.dto.EventResponse;
import com.acme.tickets.service.EventService;
import com.acme.tickets.service.OrderService;
import javax.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/events")
public class EventController {

  private final EventService eventService;
  private final OrderService orderService;

  public EventController(EventService eventService, OrderService orderService) {
    this.eventService = eventService;
    this.orderService = orderService;
  }

  @GetMapping
  public List<EventResponse> list(@RequestParam(name = "city", required = false) String city,
                                  @RequestParam(name = "onSale", defaultValue = "false") boolean onSale) {
    return eventService.list(city, onSale);
  }

  @GetMapping("/{id}")
  public EventResponse get(@PathVariable("id") Long id) {
    return eventService.get(id);
  }

  @GetMapping("/{id}/revenue")
  public BigDecimal revenue(@PathVariable("id") Long id) {
    return orderService.revenue(id);
  }

  @PostMapping
  public ResponseEntity<EventResponse> create(@Valid @RequestBody EventRequest request) {
    return ResponseEntity.status(HttpStatus.CREATED).body(eventService.create(request));
  }

  @PostMapping("/{id}/publish")
  public EventResponse publish(@PathVariable("id") Long id) {
    return eventService.publish(id);
  }

  @PostMapping("/{id}/cancel")
  public EventResponse cancel(@PathVariable("id") Long id) {
    return eventService.cancel(id);
  }
}
