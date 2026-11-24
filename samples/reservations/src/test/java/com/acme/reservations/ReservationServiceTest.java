package com.acme.reservations;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class ReservationServiceTest {

  @Test
  void addKeepsTheValue() {
    ReservationService service = new ReservationService();
    service.add("Ada");
    assertEquals("Ada", service.list().get(0));
  }
}
