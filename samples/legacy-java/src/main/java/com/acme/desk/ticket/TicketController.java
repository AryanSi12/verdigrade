package com.acme.desk.ticket;

import java.util.List;
import javax.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/tickets")
public class TicketController {

  private final TicketService service;

  public TicketController(TicketService service) {
    this.service = service;
  }

  @GetMapping
  public List<Ticket> list() {
    return service.all();
  }

  @GetMapping("/{id}")
  public Ticket get(@PathVariable("id") Long id) {
    return service.require(id);
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  public Ticket open(@Valid @RequestBody TicketRequest request) {
    return service.open(request);
  }
}
