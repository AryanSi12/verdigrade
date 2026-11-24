package com.acme.desk.ticket;

import com.acme.desk.framework.BaseService;
import com.acme.desk.util.ReferenceGenerator;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Service;

@Service
public class TicketService extends BaseService<Ticket> {

  private final TicketRepository tickets;
  private final ReferenceGenerator references;
  private final NotificationService notifications;

  public TicketService(TicketRepository tickets, ReferenceGenerator references, NotificationService notifications) {
    this.tickets = tickets;
    this.references = references;
    this.notifications = notifications;
  }

  @Override
  protected JpaRepository<Ticket, Long> repository() {
    return tickets;
  }

  @Override
  protected void beforeSave(Ticket ticket) {
    if (ticket.getReference() == null) {
      ticket.setReference(references.nextTicketReference());
    }
  }

  @Override
  protected void afterSave(Ticket ticket) {
    if (ticket.getVersion() == null || ticket.getVersion() == 0L) {
      notifications.ticketOpened(ticket);
    }
  }

  public Ticket open(TicketRequest request) {
    Ticket ticket = new Ticket();
    ticket.setTitle(request.getTitle());
    ticket.setPriority(request.getPriority());
    ticket.setAssignee(request.getAssignee());
    return save(ticket);
  }

  public Ticket close(Long id) {
    Ticket ticket = require(id);
    ticket.setStatus("CLOSED");
    Ticket saved = tickets.save(ticket);
    notifications.ticketClosed(saved);
    return saved;
  }

  public Ticket escalate(Long id) {
    Ticket ticket = require(id);
    ticket.setPriority("HIGH");
    return tickets.save(ticket);
  }
}
