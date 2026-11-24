package com.acme.tickets.repository;

import com.acme.tickets.entity.Ticket;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TicketRepository extends JpaRepository<Ticket, Long> {

  List<Ticket> findByTicketOrderId(Long orderId);

  Optional<Ticket> findByCode(String code);

  void deleteByTicketOrderId(Long orderId);
}
