package com.acme.payments.common;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Set;
import javax.validation.ConstraintViolation;
import javax.validation.Validation;
import javax.validation.Validator;
import org.junit.jupiter.api.Test;

class CurrencyValidatorTest {

  static class Holder {
    @ValidCurrency
    String currency;

    Holder(String currency) {
      this.currency = currency;
    }
  }

  private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

  @Test
  void supportedCodesPass() {
    assertTrue(validator.validate(new Holder("AED")).isEmpty());
  }

  @Test
  void unknownCodesFailWithTheMessage() {
    Set<ConstraintViolation<Holder>> violations = validator.validate(new Holder("ZZZ"));
    assertEquals(1, violations.size());
    assertEquals("unsupported currency", violations.iterator().next().getMessage());
  }

  @Test
  void nullIsLeftToNotNull() {
    assertTrue(validator.validate(new Holder(null)).isEmpty());
  }
}
