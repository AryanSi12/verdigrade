package com.acme.payments.common;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import javax.validation.ConstraintValidator;
import javax.validation.ConstraintValidatorContext;

public class CurrencyValidator implements ConstraintValidator<ValidCurrency, String> {

  private static final Set<String> SUPPORTED = new HashSet<String>(Arrays.asList("INR", "USD", "EUR", "GBP", "AED", "SGD"));

  public static boolean isSupported(String code) {
    return code != null && SUPPORTED.contains(code);
  }

  @Override
  public boolean isValid(String value, ConstraintValidatorContext context) {
    return value == null || isSupported(value);
  }
}
