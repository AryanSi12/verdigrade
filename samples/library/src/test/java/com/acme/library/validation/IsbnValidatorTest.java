package com.acme.library.validation;

import java.util.Set;
import com.acme.library.dto.BookRequest;
import javax.validation.ConstraintViolation;
import javax.validation.Validation;
import javax.validation.Validator;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class IsbnValidatorTest {

  private static Validator validator;

  @BeforeAll
  static void setUp() {
    validator = Validation.buildDefaultValidatorFactory().getValidator();
  }

  private BookRequest request(String isbn) {
    BookRequest request = new BookRequest();
    request.setTitle("A Title");
    request.setIsbn(isbn);
    request.setPublishedYear(2001);
    request.setGenre("FICTION");
    request.setCopies(2);
    request.setAuthorId(1L);
    return request;
  }

  @Test
  void validIsbnPasses() {
    assertTrue(validator.validate(request("9780134685991")).isEmpty());
  }

  @Test
  void badIsbnIsReportedOnTheField() {
    Set<ConstraintViolation<BookRequest>> violations = validator.validate(request("9780134685992"));
    assertEquals(1, violations.size());
    assertEquals("isbn", violations.iterator().next().getPropertyPath().toString());
  }

  @Test
  void blankTitleAndZeroCopiesAreRejected() {
    BookRequest request = request("9780134685991");
    request.setTitle(" ");
    request.setCopies(0);
    assertEquals(2, validator.validate(request).size());
  }
}
