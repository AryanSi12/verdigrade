package com.acme.tickets.service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;
import com.acme.tickets.config.TicketsProperties;
import com.acme.tickets.dto.OrderRequest;
import com.acme.tickets.dto.OrderResponse;
import com.acme.tickets.entity.Customer;
import com.acme.tickets.entity.Event;
import com.acme.tickets.entity.EventStatus;
import com.acme.tickets.entity.OrderStatus;
import com.acme.tickets.entity.Ticket;
import com.acme.tickets.entity.TicketOrder;
import com.acme.tickets.exception.BusinessRuleException;
import com.acme.tickets.exception.ResourceNotFoundException;
import com.acme.tickets.mapper.OrderMapper;
import com.acme.tickets.repository.EventRepository;
import com.acme.tickets.repository.TicketOrderRepository;
import com.acme.tickets.repository.TicketRepository;
import com.acme.tickets.util.TicketCodeGenerator;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class OrderService {

  private final TicketOrderRepository orders;
  private final EventRepository events;
  private final TicketRepository tickets;
  private final EventService eventService;
  private final CustomerService customerService;
  private final PricingService pricing;
  private final TicketCodeGenerator codes;
  private final TicketsProperties properties;

  public OrderService(TicketOrderRepository orders, EventRepository events, TicketRepository tickets, EventService eventService,
                      CustomerService customerService, PricingService pricing, TicketCodeGenerator codes, TicketsProperties properties) {
    this.orders = orders;
    this.events = events;
    this.tickets = tickets;
    this.eventService = eventService;
    this.customerService = customerService;
    this.pricing = pricing;
    this.codes = codes;
    this.properties = properties;
  }

  public OrderResponse place(OrderRequest request) {
    Event event = eventService.find(request.getEventId());
    Customer customer = customerService.find(request.getCustomerId());
    if (event.getStatus() != EventStatus.ON_SALE) {
      throw new BusinessRuleException("Event '" + event.getTitle() + "' is not on sale");
    }
    if (request.getQuantity() > properties.getMaxTicketsPerOrder()) {
      throw new BusinessRuleException("At most " + properties.getMaxTicketsPerOrder() + " tickets per order");
    }
    if (request.getQuantity() > event.ticketsLeft()) {
      throw new BusinessRuleException("Only " + event.ticketsLeft() + " tickets left");
    }
    event.setTicketsSold(event.getTicketsSold() + request.getQuantity());
    if (event.ticketsLeft() == 0) {
      event.setStatus(EventStatus.SOLD_OUT);
    }
    events.save(event);

    TicketOrder order = new TicketOrder();
    order.setEvent(event);
    order.setCustomer(customer);
    order.setQuantity(request.getQuantity());
    order.setTotal(pricing.total(event.getTicketPrice(), request.getQuantity()));
    order.setStatus(OrderStatus.PENDING);
    return OrderMapper.toResponse(orders.save(order));
  }

  public OrderResponse pay(Long orderId) {
    TicketOrder order = find(orderId);
    if (order.getStatus() != OrderStatus.PENDING) {
      throw new BusinessRuleException("Only pending orders can be paid");
    }
    order.setStatus(OrderStatus.PAID);
    for (int i = 0; i < order.getQuantity(); i++) {
      Ticket ticket = new Ticket();
      ticket.setTicketOrder(order);
      ticket.setCode(codes.generate(order.getEvent().getId()));
      tickets.save(ticket);
    }
    return OrderMapper.toResponse(orders.save(order));
  }

  public OrderResponse cancel(Long orderId) {
    TicketOrder order = find(orderId);
    if (order.getStatus() != OrderStatus.PENDING && order.getStatus() != OrderStatus.PAID) {
      throw new BusinessRuleException("Order " + orderId + " can no longer be cancelled");
    }
    release(order, OrderStatus.CANCELLED);
    return OrderMapper.toResponse(orders.save(order));
  }

  public OrderResponse refund(Long orderId) {
    TicketOrder order = find(orderId);
    if (order.getStatus() != OrderStatus.PAID) {
      throw new BusinessRuleException("Only paid orders can be refunded");
    }
    release(order, OrderStatus.REFUNDED);
    return OrderMapper.toResponse(orders.save(order));
  }

  /** Cancels pending orders older than the cutoff and returns how many were cancelled. */
  public int expirePending(LocalDateTime cutoff) {
    List<TicketOrder> stale = orders.findByStatusAndCreatedAtBefore(OrderStatus.PENDING, cutoff);
    for (TicketOrder order : stale) {
      release(order, OrderStatus.CANCELLED);
      orders.save(order);
    }
    return stale.size();
  }

  @Transactional(readOnly = true)
  public OrderResponse get(Long orderId) {
    return OrderMapper.toResponse(find(orderId));
  }

  @Transactional(readOnly = true)
  public List<OrderResponse> forCustomer(Long customerId) {
    return orders.findByCustomerIdOrderByCreatedAtDesc(customerId).stream().map(OrderMapper::toResponse).collect(Collectors.toList());
  }

  @Transactional(readOnly = true)
  public BigDecimal revenue(Long eventId) {
    return orders.revenueFor(eventId);
  }

  private void release(TicketOrder order, OrderStatus newStatus) {
    Event event = order.getEvent();
    event.setTicketsSold(event.getTicketsSold() - order.getQuantity());
    if (event.getStatus() == EventStatus.SOLD_OUT) {
      event.setStatus(EventStatus.ON_SALE);
    }
    events.save(event);
    tickets.deleteByTicketOrderId(order.getId());
    order.setStatus(newStatus);
  }

  private TicketOrder find(Long id) {
    return orders.findById(id).orElseThrow(() -> new ResourceNotFoundException("Order", id));
  }
}
