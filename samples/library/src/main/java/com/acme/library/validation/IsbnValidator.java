package com.acme.library.validation;

import com.acme.library.util.IsbnUtils;
import javax.validation.ConstraintValidator;
import javax.validation.ConstraintValidatorContext;

public class IsbnValidator implements ConstraintValidator<ValidIsbn, String> {

  @Override
  public boolean isValid(String value, ConstraintValidatorContext context) {
    return value == null || IsbnUtils.isValid(value);
  }
}
