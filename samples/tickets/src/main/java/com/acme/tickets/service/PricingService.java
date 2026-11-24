package com.acme.tickets.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import com.acme.tickets.config.TicketsProperties;
import org.springframework.stereotype.Service;

@Service
public class PricingService {

  private static final BigDecimal HUNDRED = new BigDecimal("100");

  private final TicketsProperties properties;

  public PricingService(TicketsProperties properties) {
    this.properties = properties;
  }

  /** 10% group discount from 4 tickets, then the service fee on top. */
  public BigDecimal total(BigDecimal unitPrice, int quantity) {
    BigDecimal subtotal = unitPrice.multiply(BigDecimal.valueOf(quantity));
    BigDecimal discount = quantity >= 4 ? subtotal.multiply(new BigDecimal("0.10")) : BigDecimal.ZERO;
    BigDecimal net = subtotal.subtract(discount);
    BigDecimal fee = net.multiply(BigDecimal.valueOf(properties.getServiceFeePercent())).divide(HUNDRED);
    return net.add(fee).setScale(2, RoundingMode.HALF_UP);
  }
}
