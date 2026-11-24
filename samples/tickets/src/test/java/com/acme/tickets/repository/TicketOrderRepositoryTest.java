package com.acme.tickets.repository;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import com.acme.tickets.entity.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import static org.junit.jupiter.api.Assertions.*;

@DataJpaTest
class TicketOrderRepositoryTest {

  @Autowired private TestEntityManager em;
  @Autowired private TicketOrderRepository orders;
  @Autowired private TicketRepository tickets;

  private Event event;
  private Customer customer;

  @BeforeEach
  void setUp() {
    Venue venue = new Venue();
    venue.setName("Hall");
    venue.setCity("Pune");
    venue.setCapacity(100);
    em.persist(venue);
    event = new Event();
    event.setTitle("Show");
    event.setVenue(venue);
    event.setStartsAt(LocalDateTime.now().plusDays(3));
    event.setTicketPrice(BigDecimal.TEN);
    event.setCapacity(100);
    event.setStatus(EventStatus.ON_SALE);
    em.persist(event);
    customer = new Customer();
    customer.setName("Buyer");
    customer.setEmail("buyer@example.org");
    em.persist(customer);
  }

  private TicketOrder order(String total, OrderStatus status) {
    TicketOrder order = new TicketOrder();
    order.setEvent(event);
    order.setCustomer(customer);
    order.setQuantity(1);
    order.setTotal(new BigDecimal(total));
    order.setStatus(status);
    return em.persist(order);
  }

  @Test
  void revenueCountsOnlyPaidOrders() {
    order("10.00", OrderStatus.PAID);
    order("15.50", OrderStatus.PAID);
    order("99.00", OrderStatus.PENDING);
    assertEquals(0, new BigDecimal("25.50").compareTo(orders.revenueFor(event.getId())));
  }

  @Test
  void revenueIsZeroWithoutPaidOrders() {
    assertEquals(0, BigDecimal.ZERO.compareTo(orders.revenueFor(event.getId())));
  }

  @Test
  void findsPendingOrdersBeforeACutoff() {
    order("10.00", OrderStatus.PENDING);
    order("10.00", OrderStatus.PAID);
    assertEquals(1, orders.findByStatusAndCreatedAtBefore(OrderStatus.PENDING, LocalDateTime.now().plusMinutes(1)).size());
    assertTrue(orders.findByStatusAndCreatedAtBefore(OrderStatus.PENDING, LocalDateTime.now().minusDays(1)).isEmpty());
  }

  @Test
  void ticketsAreFoundByCodeAndDeletedWithTheirOrder() {
    TicketOrder order = order("10.00", OrderStatus.PAID);
    Ticket ticket = new Ticket();
    ticket.setTicketOrder(order);
    ticket.setCode("TKT-1-ABCDEFGHIJ");
    tickets.save(ticket);
    assertTrue(tickets.findByCode("TKT-1-ABCDEFGHIJ").isPresent());
    assertEquals(1, tickets.findByTicketOrderId(order.getId()).size());
    tickets.deleteByTicketOrderId(order.getId());
    assertTrue(tickets.findByTicketOrderId(order.getId()).isEmpty());
  }

  @Test
  void ordersForACustomerComeBackNewestFirst() {
    TicketOrder first = order("10.00", OrderStatus.PAID);
    TicketOrder second = order("20.00", OrderStatus.PAID);
    assertEquals(2, orders.findByCustomerIdOrderByCreatedAtDesc(customer.getId()).size());
    assertNotNull(first.getCreatedAt());
    assertNotNull(second.getCreatedAt());
  }
}
