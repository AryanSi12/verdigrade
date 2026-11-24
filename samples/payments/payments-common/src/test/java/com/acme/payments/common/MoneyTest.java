package com.acme.payments.common;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

class MoneyTest {

  @Test
  void amountsAreHeldToTwoDecimals() {
    assertEquals(new BigDecimal("12.50"), Money.of("12.5", "INR").amount());
  }

  @Test
  void plusAndMinusKeepTheCurrency() {
    Money total = Money.of("10.10", "USD").plus(Money.of("0.20", "USD"));
    assertEquals(Money.of("10.30", "USD"), total);
    assertEquals(Money.of("10.00", "USD"), total.minus(Money.of("0.30", "USD")));
  }

  @Test
  void mixingCurrenciesIsRejected() {
    assertThrows(IllegalArgumentException.class, () -> Money.of("1", "INR").plus(Money.of("1", "USD")));
  }

  @Test
  void unsupportedCurrencyIsRejected() {
    assertThrows(IllegalArgumentException.class, () -> Money.of("1", "XXX"));
  }

  @Test
  void splitAddsBackUpExactly() {
    Money[] shares = Money.of("100.00", "INR").split(3);
    assertEquals(Money.of("33.34", "INR"), shares[0]);
    assertEquals(Money.of("33.33", "INR"), shares[2]);
    Money sum = shares[0].plus(shares[1]).plus(shares[2]);
    assertEquals(Money.of("100.00", "INR"), sum);
  }

  @Test
  void comparesByAmount() {
    assertTrue(Money.of("2", "EUR").compareTo(Money.of("1.99", "EUR")) > 0);
  }
}
