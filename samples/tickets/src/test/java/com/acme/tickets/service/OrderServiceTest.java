package com.acme.tickets.service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Optional;
import com.acme.tickets.config.TicketsProperties;
import com.acme.tickets.dto.OrderRequest;
import com.acme.tickets.dto.OrderResponse;
import com.acme.tickets.entity.Customer;
import com.acme.tickets.entity.Event;
import com.acme.tickets.entity.EventStatus;
import com.acme.tickets.entity.OrderStatus;
import com.acme.tickets.entity.Ticket;
import com.acme.tickets.entity.TicketOrder;
import com.acme.tickets.entity.Venue;
import com.acme.tickets.exception.BusinessRuleException;
import com.acme.tickets.repository.EventRepository;
import com.acme.tickets.repository.TicketOrderRepository;
import com.acme.tickets.repository.TicketRepository;
import com.acme.tickets.util.TicketCodeGenerator;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.AdditionalAnswers;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class OrderServiceTest {

  @Mock private TicketOrderRepository orders;
  @Mock private EventRepository events;
  @Mock private TicketRepository tickets;
  @Mock private EventService eventService;
  @Mock private CustomerService customerService;
  @Mock private TicketCodeGenerator codes;

  private OrderService service() {
    TicketsProperties properties = new TicketsProperties();
    properties.setMaxTicketsPerOrder(6);
    properties.setServiceFeePercent(0);
    return new OrderService(orders, events, tickets, eventService, customerService, new PricingService(properties), codes, properties);
  }

  private Event event(int capacity, int sold, EventStatus status) {
    Venue venue = new Venue();
    venue.setName("Hall");
    Event event = new Event();
    event.setId(1L);
    event.setTitle("Concert");
    event.setVenue(venue);
    event.setCapacity(capacity);
    event.setTicketsSold(sold);
    event.setTicketPrice(new BigDecimal("20.00"));
    event.setStatus(status);
    return event;
  }

  private OrderRequest request(int quantity) {
    OrderRequest request = new OrderRequest();
    request.setEventId(1L);
    request.setCustomerId(2L);
    request.setQuantity(quantity);
    return request;
  }

  private void given(Event event) {
    when(eventService.find(1L)).thenReturn(event);
    when(customerService.find(2L)).thenReturn(new Customer());
  }

  private TicketOrder order(Event event, int quantity, OrderStatus status) {
    TicketOrder order = new TicketOrder();
    order.setId(10L);
    order.setEvent(event);
    order.setCustomer(new Customer());
    order.setQuantity(quantity);
    order.setStatus(status);
    order.setTotal(BigDecimal.TEN);
    return order;
  }

  @Test
  void placeTakesSeatsAndPricesTheOrder() {
    Event event = event(100, 10, EventStatus.ON_SALE);
    given(event);
    when(orders.save(any(TicketOrder.class))).then(AdditionalAnswers.returnsFirstArg());
    OrderResponse response = service().place(request(2));
    assertEquals(new BigDecimal("40.00"), response.getTotal());
    assertEquals("PENDING", response.getStatus());
    assertEquals(12, event.getTicketsSold());
  }

  @Test
  void placingTheLastSeatsMarksTheEventSoldOut() {
    Event event = event(10, 8, EventStatus.ON_SALE);
    given(event);
    when(orders.save(any(TicketOrder.class))).then(AdditionalAnswers.returnsFirstArg());
    service().place(request(2));
    assertEquals(EventStatus.SOLD_OUT, event.getStatus());
  }

  @Test
  void placeRejectsEventsThatAreNotOnSale() {
    given(event(100, 0, EventStatus.DRAFT));
    assertThrows(BusinessRuleException.class, () -> service().place(request(1)));
  }

  @Test
  void placeRejectsMoreThanTheOrderLimit() {
    given(event(100, 0, EventStatus.ON_SALE));
    assertThrows(BusinessRuleException.class, () -> service().place(request(7)));
  }

  @Test
  void placeRejectsMoreThanTheSeatsLeft() {
    given(event(10, 9, EventStatus.ON_SALE));
    assertThrows(BusinessRuleException.class, () -> service().place(request(2)));
    verify(orders, never()).save(any(TicketOrder.class));
  }

  @Test
  void payCreatesOneTicketPerSeat() {
    TicketOrder order = order(event(100, 3, EventStatus.ON_SALE), 3, OrderStatus.PENDING);
    when(orders.findById(10L)).thenReturn(Optional.of(order));
    when(orders.save(any(TicketOrder.class))).then(AdditionalAnswers.returnsFirstArg());
    when(codes.generate(1L)).thenReturn("A", "B", "C");
    assertEquals("PAID", service().pay(10L).getStatus());
    verify(tickets, times(3)).save(any(Ticket.class));
  }

  @Test
  void payTwiceIsRejected() {
    when(orders.findById(10L)).thenReturn(Optional.of(order(event(100, 1, EventStatus.ON_SALE), 1, OrderStatus.PAID)));
    assertThrows(BusinessRuleException.class, () -> service().pay(10L));
  }

  @Test
  void cancelGivesTheSeatsBackAndReopensASoldOutEvent() {
    Event event = event(10, 10, EventStatus.SOLD_OUT);
    when(orders.findById(10L)).thenReturn(Optional.of(order(event, 4, OrderStatus.PAID)));
    when(orders.save(any(TicketOrder.class))).then(AdditionalAnswers.returnsFirstArg());
    assertEquals("CANCELLED", service().cancel(10L).getStatus());
    assertEquals(6, event.getTicketsSold());
    assertEquals(EventStatus.ON_SALE, event.getStatus());
    verify(tickets).deleteByTicketOrderId(10L);
  }

  @Test
  void refundOnlyWorksForPaidOrders() {
    when(orders.findById(10L)).thenReturn(Optional.of(order(event(10, 1, EventStatus.ON_SALE), 1, OrderStatus.PENDING)));
    assertThrows(BusinessRuleException.class, () -> service().refund(10L));
  }

  @Test
  void expirePendingCancelsStaleOrders() {
    Event event = event(10, 2, EventStatus.ON_SALE);
    TicketOrder stale = order(event, 2, OrderStatus.PENDING);
    LocalDateTime cutoff = LocalDateTime.now();
    when(orders.findByStatusAndCreatedAtBefore(OrderStatus.PENDING, cutoff)).thenReturn(Arrays.asList(stale));
    assertEquals(1, service().expirePending(cutoff));
    assertEquals(OrderStatus.CANCELLED, stale.getStatus());
    assertEquals(0, event.getTicketsSold());
  }
}
