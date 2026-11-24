package com.acme.tickets.scheduler;

import java.time.LocalDateTime;
import com.acme.tickets.config.TicketsProperties;
import com.acme.tickets.service.OrderService;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class PendingOrderExpiryJobTest {

  @Test
  void runUsesACutoffThatIsPendingMinutesInThePast() {
    OrderService orderService = mock(OrderService.class);
    TicketsProperties properties = new TicketsProperties();
    properties.setPendingMinutes(30);
    new PendingOrderExpiryJob(orderService, properties).run();
    ArgumentCaptor<LocalDateTime> cutoff = ArgumentCaptor.forClass(LocalDateTime.class);
    verify(orderService).expirePending(cutoff.capture());
    assertTrue(cutoff.getValue().isBefore(LocalDateTime.now().minusMinutes(29)));
    assertTrue(cutoff.getValue().isAfter(LocalDateTime.now().minusMinutes(31)));
  }
}
