package com.acme.tickets.service;

import java.util.List;
import java.util.stream.Collectors;
import com.acme.tickets.dto.TicketResponse;
import com.acme.tickets.entity.Ticket;
import com.acme.tickets.exception.ResourceNotFoundException;
import com.acme.tickets.mapper.TicketMapper;
import com.acme.tickets.repository.TicketRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class TicketService {

  private final TicketRepository tickets;

  public TicketService(TicketRepository tickets) {
    this.tickets = tickets;
  }

  public List<TicketResponse> forOrder(Long orderId) {
    return tickets.findByTicketOrderId(orderId).stream().map(TicketMapper::toResponse).collect(Collectors.toList());
  }

  public TicketResponse byCode(String code) {
    Ticket ticket = tickets.findByCode(code).orElseThrow(() -> new ResourceNotFoundException("Ticket", code));
    return TicketMapper.toResponse(ticket);
  }
}
