package com.acme.loyalty;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class LoyaltyServiceTest {

  @Test
  void addKeepsTheValue() {
    LoyaltyService service = new LoyaltyService();
    service.add("M-42");
    assertEquals("M-42", service.list().get(0));
  }
}
