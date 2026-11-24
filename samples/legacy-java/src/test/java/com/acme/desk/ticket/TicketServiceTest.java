package com.acme.desk.ticket;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.acme.desk.framework.NotFoundException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@Transactional
class TicketServiceTest {

  @Autowired
  private TicketService service;

  private Ticket open(String title) {
    TicketRequest request = new TicketRequest();
    request.setTitle(title);
    request.setPriority("NORMAL");
    return service.open(request);
  }

  @Test
  void beforeSaveAssignsAReference() {
    Ticket ticket = open("VPN down");
    assertNotNull(ticket.getId());
    assertTrue(ticket.getReference().matches("TCK-[0-9]{6}"));
  }

  @Test
  void closeSetsTheStatus() {
    Ticket ticket = open("Laptop fan");
    assertEquals("CLOSED", service.close(ticket.getId()).getStatus());
  }

  @Test
  void escalateSetsHighPriority() {
    Ticket ticket = open("Payroll");
    assertEquals("HIGH", service.escalate(ticket.getId()).getPriority());
  }

  @Test
  void requireThrowsForAnUnknownId() {
    assertThrows(NotFoundException.class, () -> service.require(31337L));
  }

  @Test
  void openTicketsAreListed() {
    open("One");
    open("Two");
    assertTrue(service.all().size() >= 2);
  }
}
