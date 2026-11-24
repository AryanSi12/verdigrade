package com.acme.tickets.controller;

import java.util.List;
import com.acme.tickets.dto.TicketResponse;
import com.acme.tickets.service.TicketService;
import javax.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/tickets")
public class TicketController {

  private final TicketService ticketService;

  public TicketController(TicketService ticketService) {
    this.ticketService = ticketService;
  }

  @GetMapping("/order/{orderId}")
  public List<TicketResponse> forOrder(@PathVariable("orderId") Long orderId) {
    return ticketService.forOrder(orderId);
  }

  @GetMapping("/{code}")
  public TicketResponse byCode(@PathVariable("code") String code) {
    return ticketService.byCode(code);
  }
}
