package com.acme.fleet;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class FleetServiceTest {

  @Test
  void addKeepsTheValue() {
    FleetService service = new FleetService();
    service.add("KA-01-AB-1234");
    assertEquals("KA-01-AB-1234", service.list().get(0));
  }
}
