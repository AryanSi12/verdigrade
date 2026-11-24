package com.acme.library.validation;

import java.lang.annotation.*;
import javax.validation.Constraint;
import javax.validation.Payload;

@Documented
@Constraint(validatedBy = IsbnValidator.class)
@Target({ElementType.FIELD, ElementType.PARAMETER})
@Retention(RetentionPolicy.RUNTIME)
public @interface ValidIsbn {

  String message() default "must be a valid ISBN-10 or ISBN-13";

  Class<?>[] groups() default {};

  Class<? extends Payload>[] payload() default {};
}
