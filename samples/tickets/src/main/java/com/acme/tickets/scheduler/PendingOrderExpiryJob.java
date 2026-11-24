package com.acme.tickets.scheduler;

import java.time.LocalDateTime;
import com.acme.tickets.config.TicketsProperties;
import com.acme.tickets.service.OrderService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class PendingOrderExpiryJob {

  private static final Logger LOG = LoggerFactory.getLogger(PendingOrderExpiryJob.class);

  private final OrderService orderService;
  private final TicketsProperties properties;

  public PendingOrderExpiryJob(OrderService orderService, TicketsProperties properties) {
    this.orderService = orderService;
    this.properties = properties;
  }

  @Scheduled(fixedDelayString = "${tickets.expiry-delay-ms:60000}", initialDelay = 60000)
  public void run() {
    int count = orderService.expirePending(LocalDateTime.now().minusMinutes(properties.getPendingMinutes()));
    LOG.info("Cancelled {} unpaid order(s)", count);
  }
}
