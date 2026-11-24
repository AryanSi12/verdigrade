package com.acme.payments.common;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Objects;

/** An amount in one currency, always held to two decimal places. */
public final class Money implements Comparable<Money> {

  private final BigDecimal amount;
  private final String currency;

  private Money(BigDecimal amount, String currency) {
    this.amount = amount.setScale(2, RoundingMode.HALF_EVEN);
    this.currency = currency;
  }

  public static Money of(String amount, String currency) {
    return of(new BigDecimal(amount), currency);
  }

  public static Money of(BigDecimal amount, String currency) {
    if (!CurrencyValidator.isSupported(currency)) {
      throw new IllegalArgumentException("Unsupported currency " + currency);
    }
    return new Money(amount, currency);
  }

  public BigDecimal amount() {
    return amount;
  }

  public String currency() {
    return currency;
  }

  public Money plus(Money other) {
    requireSame(other);
    return new Money(amount.add(other.amount), currency);
  }

  public Money minus(Money other) {
    requireSame(other);
    return new Money(amount.subtract(other.amount), currency);
  }

  /** Splits into {@code parts} shares that add back up to this amount exactly (the first shares get the extra paise). */
  public Money[] split(int parts) {
    if (parts < 1) {
      throw new IllegalArgumentException("parts must be positive");
    }
    long cents = amount.movePointRight(2).longValueExact();
    Money[] shares = new Money[parts];
    for (int i = 0; i < parts; i++) {
      long share = cents / parts + (i < cents % parts ? 1 : 0);
      shares[i] = new Money(BigDecimal.valueOf(share, 2), currency);
    }
    return shares;
  }

  private void requireSame(Money other) {
    if (!currency.equals(other.currency)) {
      throw new IllegalArgumentException("Currency mismatch: " + currency + " vs " + other.currency);
    }
  }

  @Override
  public int compareTo(Money other) {
    requireSame(other);
    return amount.compareTo(other.amount);
  }

  @Override
  public boolean equals(Object o) {
    if (!(o instanceof Money)) {
      return false;
    }
    Money other = (Money) o;
    return currency.equals(other.currency) && amount.compareTo(other.amount) == 0;
  }

  @Override
  public int hashCode() {
    return Objects.hash(amount.stripTrailingZeros(), currency);
  }

  @Override
  public String toString() {
    return amount.toPlainString() + " " + currency;
  }
}
