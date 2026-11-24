package com.acme.tickets.repository;

import com.acme.tickets.entity.OrderStatus;
import com.acme.tickets.entity.TicketOrder;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TicketOrderRepository extends JpaRepository<TicketOrder, Long> {

  List<TicketOrder> findByCustomerIdOrderByCreatedAtDesc(Long customerId);

  List<TicketOrder> findByStatusAndCreatedAtBefore(OrderStatus status, LocalDateTime cutoff);

  @Query("select coalesce(sum(o.total), 0) from TicketOrder o where o.event.id = :eventId and o.status = 'PAID'")
  BigDecimal revenueFor(@Param("eventId") Long eventId);
}
