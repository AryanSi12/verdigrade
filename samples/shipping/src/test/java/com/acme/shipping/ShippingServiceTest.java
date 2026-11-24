package com.acme.shipping;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class ShippingServiceTest {

  @Test
  void addKeepsTheValue() {
    ShippingService service = new ShippingService();
    service.add("ACME-1001");
    assertEquals("ACME-1001", service.list().get(0));
  }
}
