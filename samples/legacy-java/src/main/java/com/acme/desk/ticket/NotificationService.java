package com.acme.desk.ticket;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class NotificationService {

  private static final Logger LOG = LoggerFactory.getLogger(NotificationService.class);

  private final java.util.concurrent.atomic.AtomicInteger opened = new java.util.concurrent.atomic.AtomicInteger();

  public void ticketOpened(Ticket ticket) {
    opened.incrementAndGet();
    LOG.info("Ticket {} opened: {}", ticket.getReference(), ticket.getTitle());
  }

  public int openedCount() {
    return opened.get();
  }

  public void ticketClosed(Ticket ticket) {
    LOG.info("Ticket {} closed", ticket.getReference());
  }
}
