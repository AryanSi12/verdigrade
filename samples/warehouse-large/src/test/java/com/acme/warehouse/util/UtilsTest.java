package com.acme.warehouse.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class UtilsTest {

  @Test
  void skuIsASlugWithAPaddedSerial() {
    assertEquals("PALLET-JACK-2T-0007", SkuGenerator.forName(" Pallet Jack 2T ", 7));
  }

  @Test
  void ordersUpToTargetOnlyBelowReorderPoint() {
    assertEquals(0, ReorderCalculator.unitsToOrder(12, 10, 50));
    assertEquals(45, ReorderCalculator.unitsToOrder(5, 10, 50));
  }

  @Test
  void lowStockIsInclusive() {
    assertTrue(ReorderCalculator.isLow(5, 5));
    assertFalse(ReorderCalculator.isLow(6, 5));
  }
}
