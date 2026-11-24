package com.acme.desk.ticket;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import javax.validation.Validation;
import javax.validation.Validator;
import org.junit.jupiter.api.Test;

class TicketRequestValidationTest {

  private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

  private TicketRequest request(String title, String priority) {
    TicketRequest request = new TicketRequest();
    request.setTitle(title);
    request.setPriority(priority);
    return request;
  }

  @Test
  void aNormalRequestIsValid() {
    assertTrue(validator.validate(request("Printer jam", "HIGH")).isEmpty());
  }

  @Test
  void aBlankTitleIsInvalid() {
    assertEquals(1, validator.validate(request("  ", "LOW")).size());
  }

  @Test
  void anUnknownPriorityIsInvalid() {
    assertEquals(1, validator.validate(request("x", "URGENT")).size());
  }
}
