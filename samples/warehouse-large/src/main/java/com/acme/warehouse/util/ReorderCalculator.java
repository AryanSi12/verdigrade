package com.acme.warehouse.util;

public final class ReorderCalculator {

  private ReorderCalculator() {
  }

  /** How many units to order so stock returns to {@code target}; 0 when the level is at or above the reorder point. */
  public static int unitsToOrder(int onHand, int reorderLevel, int target) {
    if (onHand >= reorderLevel) {
      return 0;
    }
    return Math.max(0, target - onHand);
  }

  public static boolean isLow(int onHand, int threshold) {
    return onHand <= threshold;
  }
}
