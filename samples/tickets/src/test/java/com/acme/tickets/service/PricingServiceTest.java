package com.acme.tickets.service;

import java.math.BigDecimal;
import com.acme.tickets.config.TicketsProperties;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;

class PricingServiceTest {

  private PricingService service(int feePercent) {
    TicketsProperties properties = new TicketsProperties();
    properties.setServiceFeePercent(feePercent);
    return new PricingService(properties);
  }

  @Test
  void singleTicketGetsOnlyTheServiceFee() {
    assertEquals(new BigDecimal("26.25"), service(5).total(new BigDecimal("25.00"), 1));
  }

  @Test
  void fourOrMoreTicketsGetTenPercentOff() {
    assertEquals(new BigDecimal("94.50"), service(5).total(new BigDecimal("25.00"), 4));
  }

  @Test
  void zeroFeeMeansPlainSubtotal() {
    assertEquals(new BigDecimal("50.00"), service(0).total(new BigDecimal("25.00"), 2));
  }
}
