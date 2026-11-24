package com.acme.payments.common;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class LuhnCheckerTest {

  @Test
  void acceptsAKnownTestCardNumber() {
    assertTrue(LuhnChecker.isValid("4242424242424242"));
  }

  @Test
  void rejectsABrokenCheckDigitAndJunk() {
    assertFalse(LuhnChecker.isValid("4242424242424241"));
    assertFalse(LuhnChecker.isValid("4242-4242"));
    assertFalse(LuhnChecker.isValid(null));
  }

  @Test
  void masksAllButTheLastFour() {
    assertEquals("************4242", LuhnChecker.mask("4242 4242 4242 4242"));
  }
}
