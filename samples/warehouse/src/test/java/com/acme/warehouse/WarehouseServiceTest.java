package com.acme.warehouse;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class WarehouseServiceTest {

  @Test
  void addKeepsTheValue() {
    WarehouseService service = new WarehouseService();
    service.add("BIN-7");
    assertEquals("BIN-7", service.list().get(0));
  }
}
